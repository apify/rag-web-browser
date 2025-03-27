import { describe, it, expect } from 'vitest';
import { BoundedArray } from '../src/helpers/bouded-array';

describe('BoundedArray', () => {
  it('should add items to the array', () => {
    const boundedArray = new BoundedArray<number>(5);
    boundedArray.add(1);
    expect(boundedArray.has(1)).toBe(true);
  });

  it('should remove oldest items when max size is reached', () => {
    const boundedArray = new BoundedArray<number>(3);
    boundedArray.add(1);
    boundedArray.add(2);
    boundedArray.add(3);
    boundedArray.add(4);
    
    expect(boundedArray.has(1)).toBe(false);
    expect(boundedArray.has(2)).toBe(true);
    expect(boundedArray.has(3)).toBe(true);
    expect(boundedArray.has(4)).toBe(true);
  });

  it('should delete items from the array', () => {
    const boundedArray = new BoundedArray<number>(5);
    boundedArray.add(1);
    boundedArray.add(2);
    
    expect(boundedArray.delete(1)).toBe(true);
    expect(boundedArray.has(1)).toBe(false);
    expect(boundedArray.has(2)).toBe(true);
  });

  it('should return false when trying to delete non-existing item', () => {
    const boundedArray = new BoundedArray<number>(5);
    boundedArray.add(1);
    
    expect(boundedArray.delete(2)).toBe(false);
    expect(boundedArray.has(1)).toBe(true);
  });

  it('should handle different types of items', () => {
    const boundedArray = new BoundedArray<string>(3);
    boundedArray.add('a');
    boundedArray.add('b');
    boundedArray.add('c');
    
    expect(boundedArray.has('a')).toBe(true);
    expect(boundedArray.has('b')).toBe(true);
    expect(boundedArray.has('c')).toBe(true);
    expect(boundedArray.has('d')).toBe(false);
  });
});