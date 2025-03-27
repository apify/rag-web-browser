/**
 * Bounded array class with maximum size. Mainly used as a store for timed out responses.
 * This is used to keep track of all timed out responses and then cancel their requests.
 * Bounded array is used to remove the oldest responses to prevent memory leaks.
 */
export class BoundedArray<T> {
    private items: T[] = [];
    private maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    add(item: T): void {
        if (this.items.length >= this.maxSize) {
            this.items.shift();
        }
        this.items.push(item);
    }

    has(item: T): boolean {
        return this.items.includes(item);
    }

    delete(item: T): boolean {
        const index = this.items.indexOf(item);
        if (index > -1) {
            this.items.splice(index, 1);
            return true;
        }
        return false;
    }
}
