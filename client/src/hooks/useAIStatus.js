import { useCallback, useEffect, useState } from 'react';
import * as aiService from '../services/aiService';

let cache = null;   // fetched once per page load
export const resetAIStatusCache = () => { cache = null; };   // used by tests
export function useAIStatus() {
  const [features, setFeatures] = useState(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setLoading(true); setError(null);
    aiService.status().then((f) => { cache = f; setFeatures(f); }).catch((e) => setError(e)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!cache) load(); }, [load]);
  return { features, loading, error, retry: load };
}
