declare module 'fuzzball' {
    export function ratio(s1: string, s2: string, options?: any): number;
    export function partial_ratio(s1: string, s2: string, options?: any): number;
    export function token_sort_ratio(s1: string, s2: string, options?: any): number;
    export function token_set_ratio(s1: string, s2: string, options?: any): number;
    export function extract(query: string, choices: string[], options?: any): Array<[string, number]>;
    export function extractAsPromised(query: string, choices: string[], options?: any): Promise<Array<[string, number]>>;
}
