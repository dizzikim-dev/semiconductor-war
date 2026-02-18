/**
 * Spatial Hash Grid — O(1) 근접 엔티티 탐색
 * 충돌 검사 최적화용 (총알, 오비탈, 오토타겟)
 */
class SpatialHash {
  constructor(cellSize = 200) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  _key(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  clear() {
    this.grid.clear();
  }

  insert(entity) {
    const key = this._key(entity.x, entity.y);
    let bucket = this.grid.get(key);
    if (!bucket) {
      bucket = [];
      this.grid.set(key, bucket);
    }
    bucket.push(entity);
  }

  /**
   * 반경 내 후보 엔티티 반환 (정확한 거리 체크는 호출자 책임)
   */
  query(x, y, radius) {
    const results = [];
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const bucket = this.grid.get(`${cx},${cy}`);
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            results.push(bucket[i]);
          }
        }
      }
    }
    return results;
  }
}

module.exports = SpatialHash;
