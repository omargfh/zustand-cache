import {
  dbClient_mapper_article,
  getRecommendedArticlesAxios,
} from "@/app/(_layout)/blog/articles/genericGetters";
import RecentArticlesCarouselClient from "./RecentArticlesCarousel.client";
import {
  useCache
} from "@/components/stores/cache";
import { useEffect, useState } from "react";
import { AsyncComponent, useLoading } from "@/components/hooks/useLoading";

export default function RecentArticlesCarousel({
  cacheKey = "blog.landing.recent",
}) {
  const [store, setStore] = useCache<ReturnType<typeof dbClient_mapper_article>[]>("blog", cacheKey);
  const { start, end, loadingState } = useLoading({
    loading: true,
  });
  useEffect(() => {
    start();
    if (store) return; // Should be revalidated automatically
    try {
      getRecommendedArticlesAxios({ count: 6 }).then((results) => {
        const articles = results.data;
        setStore(articles);
      });
      end();
    } catch (error) {
      end(String(error));
    }
  }, [store]);
  return (
    <AsyncComponent loadingState={loadingState} defaultContentHeight="200px">
      <RecentArticlesCarouselClient recent={recent} />
    </AsyncComponent>
  );
}
