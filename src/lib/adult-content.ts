import { SearchResult } from './types';

export const BDZY_ADULT_TYPE_ID = 55;

export function isAdultResult(result: SearchResult): boolean {
  return (
    result.source === 'bdzy' && Number(result.type_id) === BDZY_ADULT_TYPE_ID
  );
}

export function filterAdultResults(
  results: SearchResult[],
  includeAdult: boolean
): SearchResult[] {
  return includeAdult
    ? results
    : results.filter((result) => !isAdultResult(result));
}
