/**
 * Partition array into two, one is consisted with satisfy a given predicate, other is not.
 * @param array Original array
 * @param predicate Predicate to split the array into two arrays
 */
export function partition<T>(array: readonly T[], predicate: (elem: T) => boolean): [T[], T[]] {
  return array.reduce((result, value) => (
    result[predicate(value) ? 0 : 1].push(value), result
  ), <[T[], T[]]>[[], []]);
}

/**
 * Return intersection of two arrays
 * @param arr1 
 * @param arr2 
 * @param predicate 
 */
export function intersectArrays<T>(arr1: T[], arr2: T[], predicate: (elm1: T, elm2: T) => boolean): T[] {
  return arr1.filter(elm1 => arr2.findIndex(elm2 => predicate(elm1, elm2)) !== -1);
}

/**
 * Distinct array with given predicate
 * @param array
 * @param keyGetter
 */
export function uniqueBy<T>(array: T[], keyGetter: (elm: T) => string | number | symbol): T[]{
  const seen = new Set();
  return array.filter(item => {
    const k = keyGetter(item);
    return seen.has(k) ? false : (seen.add(k));
  });
}

/**
 * Flatten array
 * @param arr 
 */
export function flatten<T>(arr: T[][]) {
  return ([] as T[]).concat(...arr);
}

/**
 * Set, except equility is given by a custom predicate
 */
export class SetWith<T> {
  private setArray: T[];
  
  constructor(private predicate: (item1: T, item2: T) => boolean) {
    this.setArray = [];
  }
  
  public add(item: T) : boolean {
    if(this.has(item)) { return false; }
    
    this.setArray.push(item);
    
    return true;
  }
  
  public has(item: T): boolean {
    return this.setArray.findIndex(i => this.predicate(i, item)) !== -1;
  }
}
