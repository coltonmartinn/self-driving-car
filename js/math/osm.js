// Converts Overpass API JSON (OpenStreetMap) into graph points and segments
const Osm = {
   parseRoads: (data) => {
      const nodes = data.elements.filter((n) => n.type == "node");

      // reduce instead of Math.min(...) so big areas don't overflow the stack
      const minLat = nodes.reduce((m, n) => Math.min(m, n.lat), Infinity);
      const maxLat = nodes.reduce((m, n) => Math.max(m, n.lat), -Infinity);
      const minLon = nodes.reduce((m, n) => Math.min(m, n.lon), Infinity);
      const maxLon = nodes.reduce((m, n) => Math.max(m, n.lon), -Infinity);

      const deltaLat = maxLat - minLat;
      const deltaLon = maxLon - minLon;
      const ar = deltaLon / deltaLat;
      // 1 degree of latitude ≈ 111 km; 10 world units per meter
      const height = deltaLat * 111000 * 10;
      // longitude degrees shrink towards the poles
      const width = height * ar * Math.cos(degToRad(maxLat));

      const points = [];
      const byId = new Map();
      for (const node of nodes) {
         const y = invLerp(maxLat, minLat, node.lat) * height - height / 2;
         const x = invLerp(minLon, maxLon, node.lon) * width - width / 2;
         const point = new Point(x, y);
         point.id = node.id;
         points.push(point);
         byId.set(node.id, point);
      }

      const segments = [];
      const ways = data.elements.filter((w) => w.type == "way");
      for (const way of ways) {
         const ids = way.nodes;
         const tags = way.tags || {};
         const oneWay = tags.oneway == "yes" || tags.lanes == 1;
         for (let i = 1; i < ids.length; i++) {
            const prev = byId.get(ids[i - 1]);
            const cur = byId.get(ids[i]);
            if (prev && cur && !prev.equals(cur)) {
               segments.push(new Segment(prev, cur, oneWay));
            }
         }
      }

      return { points, segments };
   },
};
