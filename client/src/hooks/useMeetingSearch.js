import { useCallback, useRef, useState } from 'react';
import * as searchService from '../services/searchService';
import { errorMessage, errorCode } from '../services/api';

// status: idle | loading | done | error. Late responses from an older request are ignored.
export function useMeetingSearch() {
  const [state, setState] = useState({ status: 'idle', result: null, error: '', code: null });
  const last = useRef(0);
  const run = useCallback(async (body) => {
    const id = ++last.current;
    setState({ status: 'loading', result: null, error: '', code: null });
    try {
      const result = await searchService.query(body);
      if (id === last.current) setState({ status: 'done', result, error: '', code: null });
    } catch (e) {
      if (id === last.current) setState({ status: 'error', result: null, error: errorMessage(e, 'The search failed.'), code: errorCode(e) });
    }
  }, []);
  const reset = useCallback(() => { last.current += 1; setState({ status: 'idle', result: null, error: '', code: null }); }, []);
  return { ...state, run, reset };
}
