"use client";

import { create } from "zustand";
import { produce } from "immer";
import { persist } from "zustand/middleware";

interface Policy {
  invalidationPolicy: "never" | "always" | "on-expiry";
  expiry: number;
  pruneOnSessionStart: boolean;
}
interface Store {
  cached: {
    [key: string]: {
      value: any; // zero-validation
      assignedAt: number;
    };
  };
  policy: Policy;
}
interface Stores {
  [key: string]: Store;
}
interface Statistics {
  hits: number;
  misses: number;
}
export interface CacheStore {
  stores: Stores;
  globalPolicy: Policy;
  invalidate: (store: string, key: string) => boolean; // returns true if key was invalidated
  invalidateAll: (store: string) => boolean; // returns true if store was invalidated
  invalidateAllOrThrow: (store: string) => void; // throws if store was not invalidated
  invalidateAllStores: () => void; // invalidates all stores
  prune: (store: string, key: string) => void; // removes the key from the store if it is expired
  pruneAll: (store: string) => void; // removes all expired keys from the store
  pruneAllStores: () => void; // removes all expired keys from all stores
  getValue(store: string, key: string): any | null; // returns the value of the key in the store or null if it does not exist
  createStore: (store: string, policy: Partial<Policy>) => void; // creates a new store with the given policy
  setValue(store: string, key: string, value: any): void; // sets the value of the key in the store
  setGlobalPolicy: (policy: Partial<Policy>) => void; // sets the global policy
  setStorePolicy: (store: string, policy: Partial<Policy>) => void; // sets the policy of the store
  _debug: () => void; // logs the current state
  _debugStatistics: Statistics;
  _incrementHits: () => void;
  _incrementMisses: () => void;
}

export const useCacheStore = create(
  persist<CacheStore>(
    (set, get) => ({
      stores: {},
      globalPolicy: {
        invalidationPolicy: "on-expiry",
        expiry: 60 * 60 * 1000, // 1 hour (60 minutes * 60 seconds * 1000 milliseconds)
        pruneOnSessionStart: true,
      },
      invalidate: (store: string, key: string) => {
        const storeInstance = get().stores[store] as Store;
        if (!storeInstance) return false;
        if (!storeInstance.cached[key]) return false;
        if (storeInstance.policy.invalidationPolicy === "never") return false;

        set(
          produce((state) => {
            delete state.stores[store].cached[key];
          })
        );

        return true;
      },
      invalidateAll: (store: string) => {
        const storeInstance = get().stores[store] as Store;
        if (!storeInstance) return false;
        if (storeInstance.policy.invalidationPolicy === "never") return false;
        storeInstance.cached = {};
        return true;
      },
      invalidateAllOrThrow: (store: string) => {
        const storeInstance = get().stores[store] as Store;
        if (!storeInstance) throw new Error(`Store ${store} does not exist.`);
        if (storeInstance.policy.invalidationPolicy === "never")
          throw new Error(
            `Store ${store} cannot be invalidated because it has a policy of 'never'.`
          );
        storeInstance.cached = {};
      },
      invalidateAllStores: () => {
        const stores = get().stores as Stores;
        for (const store in stores) {
          stores[store].cached = {};
        }
      },
      prune: (store: string, key: string) => {
        const storeInstance = get().stores[store] as Store;
        if (!storeInstance) return;
        if (storeInstance.policy.invalidationPolicy !== "on-expiry") return;
        if (!storeInstance.cached[key]) return;
        if (
          storeInstance.cached[key].assignedAt + storeInstance.policy.expiry <
          Date.now()
        ) {
          set(
            produce((state) => {
              delete state.stores[store].cached[key];
            })
          );
        }
      },
      pruneAll: (store: string) => {
        const storeInstance = get().stores[store] as Store;
        const prune = get().prune;
        if (!storeInstance) return;
        for (const key in storeInstance.cached) {
          prune(store, key);
        }
      },
      pruneAllStores: () => {
        const stores = get().stores as Stores;
        for (const store in stores) {
          get().pruneAll(store);
        }
      },
      getValue(store, key) {
        const storeInstance = get().stores[store] as Store;
        if (!storeInstance) {
          console.warn("Store does not exist. Creating it.");
          get().createStore(store, {});
          return null;
        }
        const prune = get().prune;
        prune(store, key);
        const value = storeInstance.cached[key]?.value;
        if (value) {
          get()._incrementHits();
        } else {
          get()._incrementMisses();
        }
        console.log(get()._debugStatistics);
        return value;
      },
      createStore(store, policy) {
        if (get().stores[store]) return;
        set(
          produce((state) => {
            state.stores[store] = {
              cached: {},
              policy: {
                ...get().globalPolicy,
                ...policy,
              },
            };
          })
        );
      },
      setValue(store, key, value) {
        const storeInstance = get().stores[store] as Store;
        if (!storeInstance) {
          get().createStore(store, {});
        }
        set(
          produce((state) => {
            state.stores[store].cached[key] = {
              value,
              assignedAt: Date.now(),
            };
          })
        );
      },
      setGlobalPolicy(policy) {
        set(
          produce((state) => {
            state.globalPolicy = { ...state.globalPolicy, ...policy };
          })
        );
      },
      setStorePolicy(store, policy) {
        set(
          produce((state) => {
            state.stores[store].policy = {
              ...state.stores[store].policy,
              ...policy,
            };
          })
        );
      },
      _debug() {
        console.log(get());
      },
      _debugStatistics: {
        hits: 0,
        misses: 0,
        invalidationsDueToExpiry: 0,
      },
      _incrementHits() {
        set(
          produce((state) => {
            state._debugStatistics.hits++;
          })
        );
      },
      _incrementMisses() {
        set(
          produce((state) => {
            state._debugStatistics.misses++;
          })
        );
      },
    }),
    {
      name: "cache",
    }
  )
);

useCacheStore.persist?.onFinishHydration((state) => {
  if (!state) return;
  if (state?.globalPolicy.pruneOnSessionStart) {
    state.pruneAllStores();
  }
});
