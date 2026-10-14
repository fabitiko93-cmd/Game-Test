import { VIEW } from "./config.js";
import { vehicleFootprint } from "./cover.js";

const CORNER_OFFSET = .00001;

function mergeEdges(groups, axis) {
  const segments = [];
  for (const [at, intervals] of groups) {
    intervals.sort((a, b) => a[0] - b[0]);
    let [from, to] = intervals[0];
    for (const interval of intervals.slice(1)) {
      if (interval[0] <= to + .000001) to = Math.max(to, interval[1]);
      else { segments.push({ axis, at, from, to }); [from, to] = interval; }
    }
    segments.push({ axis, at, from, to });
  }
  return segments;
}

// Display geometry only. Ordinary sight blockers occupy their existing sight
// cells; cars use their precise rectangular footprint, as in World sight checks.
// Merge adjoining cell edges so a straight wall has no artificial tile seams.
export class VisionGeometry {
  constructor() {
    this.world = null;
    this.revision = 0;
    this.segments = [];
    this.cells = new Set();
    this.cars = [];
  }

  prepare(world) {
    if (this.world === world && this.sightRevision === world.sightRevision
      && this.objects === world.objects && this.coverMap === world.coverMap) return;
    this.world = world; this.sightRevision = world.sightRevision;
    this.objects = world.objects; this.coverMap = world.coverMap;
    this.revision++;
    this.cells = new Set(); this.cars = [];
    for (const object of world.objects) {
      if (object.removed || !(object.type === "door" ? object.closed : object.blocksSight)) continue;
      if (object.type === "car") this.cars.push({ x: object.x, y: object.y, ...vehicleFootprintBounds(object) });
      else this.cells.add(`${Math.round(object.x)},${Math.round(object.y)}`);
    }
    const horizontal = new Map(), vertical = new Map();
    const add = (groups, at, from, to) => {
      if (!groups.has(at)) groups.set(at, []);
      groups.get(at).push([from, to]);
    };
    for (const cell of this.cells) {
      const [x, y] = cell.split(",").map(Number);
      if (!this.cells.has(`${x - 1},${y}`)) add(vertical, x - .5, y - .5, y + .5);
      if (!this.cells.has(`${x + 1},${y}`)) add(vertical, x + .5, y - .5, y + .5);
      if (!this.cells.has(`${x},${y - 1}`)) add(horizontal, y - .5, x - .5, x + .5);
      if (!this.cells.has(`${x},${y + 1}`)) add(horizontal, y + .5, x - .5, x + .5);
    }
    for (const car of this.cars) {
      add(vertical, car.x - car.halfX, car.y - car.halfY, car.y + car.halfY);
      add(vertical, car.x + car.halfX, car.y - car.halfY, car.y + car.halfY);
      add(horizontal, car.y - car.halfY, car.x - car.halfX, car.x + car.halfX);
      add(horizontal, car.y + car.halfY, car.x - car.halfX, car.x + car.halfX);
    }
    add(vertical, 1, 1, VIEW.worldH - 1);
    add(vertical, VIEW.worldW - 1, 1, VIEW.worldH - 1);
    add(horizontal, 1, 1, VIEW.worldW - 1);
    add(horizontal, VIEW.worldH - 1, 1, VIEW.worldW - 1);
    this.segments = [...mergeEdges(vertical, "x"), ...mergeEdges(horizontal, "y")];
  }

  polygon(world, origin, angle, range, halfAngle) {
    this.prepare(world);
    if (this.cells.has(`${Math.round(origin.x)},${Math.round(origin.y)}`)
      || this.cars.some(car => Math.abs(origin.x - car.x) < car.halfX
        && Math.abs(origin.y - car.y) < car.halfY)) return [];
    const segments = this.segments.filter(segment => {
      const across = origin[segment.axis] - segment.at;
      const along = origin[segment.axis === "x" ? "y" : "x"];
      const beyond = Math.max(segment.from - along, 0, along - segment.to);
      return across * across + beyond * beyond <= range * range;
    });
    const offsets = new Set();
    const add = offset => {
      if (offset >= -halfAngle && offset <= halfAngle) offsets.add(offset);
    };
    // The regular rays describe the distant arc. Extra rays on both sides of
    // each actual corner preserve thin shadows and open doorways at any angle.
    for (let i = 0; i <= 64; i++) add(-halfAngle + halfAngle * 2 * i / 64);
    for (const segment of segments) for (const end of [segment.from, segment.to]) {
      const x = segment.axis === "x" ? segment.at : end;
      const y = segment.axis === "y" ? segment.at : end;
      const heading = Math.atan2(y - origin.y, x - origin.x) - angle;
      const offset = Math.atan2(Math.sin(heading), Math.cos(heading));
      add(offset - CORNER_OFFSET); add(offset); add(offset + CORNER_OFFSET);
    }
    return [...offsets].sort((a, b) => a - b).map(offset => {
      const dx = Math.cos(angle + offset), dy = Math.sin(angle + offset);
      let length = range;
      for (const segment of segments) {
        const direction = segment.axis === "x" ? dx : dy;
        if (Math.abs(direction) < .00000001) continue;
        const t = (segment.at - origin[segment.axis]) / direction;
        if (t < 0 || t >= length) continue;
        const other = segment.axis === "x" ? origin.y + dy * t : origin.x + dx * t;
        if (other >= segment.from - .0000001 && other <= segment.to + .0000001) length = t;
      }
      return { x: origin.x + dx * length, y: origin.y + dy * length };
    });
  }
}

function vehicleFootprintBounds(object) {
  const shape = vehicleFootprint(object);
  return { halfX: shape.x, halfY: shape.y };
}
