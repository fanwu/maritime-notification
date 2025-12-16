export interface VesselRoute {
  imo: number;
  name: string;
  vesselType: string;
  vesselClass: string;
  waypoints: { lat: number; lng: number }[];
  speedKnots: number;
}

// Pre-defined vessels with routes all starting near Singapore for demo visibility
export const mockVessels: VesselRoute[] = [
  {
    imo: 9865556,
    name: 'MV Atlantic Star',
    vesselType: 'Tanker',
    vesselClass: 'PanamaxDry',
    waypoints: [
      { lat: 1.5, lng: 103.0 },   // West of Singapore
      { lat: 1.25, lng: 103.7 },  // Approaching strait
      { lat: 1.22, lng: 103.9 },  // In Singapore Strait
      { lat: 1.25, lng: 104.1 },  // Through strait
      { lat: 1.4, lng: 104.5 },   // East of Singapore
      { lat: 2.0, lng: 105.0 },
      { lat: 3.0, lng: 106.0 },
      { lat: 1.5, lng: 103.0 },   // Loop back
    ],
    speedKnots: 12,
  },
  {
    imo: 9812345,
    name: 'MV Pacific Trader',
    vesselType: 'Dry',
    vesselClass: 'Capesize',
    waypoints: [
      { lat: 2.5, lng: 105.0 },   // Northeast
      { lat: 1.8, lng: 104.5 },
      { lat: 1.25, lng: 104.0 },  // Singapore Strait
      { lat: 1.2, lng: 103.6 },
      { lat: 1.0, lng: 103.0 },
      { lat: 0.5, lng: 102.5 },
      { lat: 1.0, lng: 103.0 },
      { lat: 2.5, lng: 105.0 },   // Loop back
    ],
    speedKnots: 14,
  },
  {
    imo: 9876543,
    name: 'MV Ocean Glory',
    vesselType: 'Container',
    vesselClass: 'PostPanamax',
    waypoints: [
      { lat: 1.4, lng: 103.5 },   // Near Singapore
      { lat: 1.28, lng: 103.8 },  // Singapore port area
      { lat: 1.25, lng: 104.0 },  // Through strait
      { lat: 1.3, lng: 104.3 },
      { lat: 1.5, lng: 104.0 },
      { lat: 1.6, lng: 103.7 },
      { lat: 1.4, lng: 103.5 },   // Loop back
    ],
    speedKnots: 18,
  },
  {
    imo: 9898989,
    name: 'MV Northern Spirit',
    vesselType: 'LNG',
    vesselClass: 'LNG Carrier',
    waypoints: [
      { lat: 0.8, lng: 103.5 },   // South of Singapore
      { lat: 1.0, lng: 103.7 },
      { lat: 1.22, lng: 103.85 }, // Singapore Strait
      { lat: 1.3, lng: 104.1 },
      { lat: 1.5, lng: 104.3 },
      { lat: 1.3, lng: 104.0 },
      { lat: 1.0, lng: 103.8 },
      { lat: 0.8, lng: 103.5 },   // Loop back
    ],
    speedKnots: 16,
  },
  {
    imo: 9765432,
    name: 'MV Eastern Dream',
    vesselType: 'Tanker',
    vesselClass: 'VLCC',
    waypoints: [
      { lat: 1.35, lng: 103.55 }, // Start near Singapore west
      { lat: 1.28, lng: 103.75 }, // Moving east
      { lat: 1.23, lng: 103.95 }, // Through strait
      { lat: 1.25, lng: 104.15 },
      { lat: 1.3, lng: 104.35 },
      { lat: 1.4, lng: 104.2 },
      { lat: 1.35, lng: 103.9 },
      { lat: 1.35, lng: 103.55 }, // Loop back
    ],
    speedKnots: 10,
  },
];

// Area names for different coordinates
export function getAreaName(lat: number, lng: number): { name: string; level1: string } {
  if (lng > 100 && lng < 110 && lat > -5 && lat < 10) {
    return { name: 'Malacca Strait', level1: 'South East Asia' };
  }
  if (lng > 100 && lng < 120 && lat > 10 && lat < 25) {
    return { name: 'South China Sea', level1: 'South East Asia' };
  }
  if (lng > 50 && lng < 80 && lat > 10 && lat < 30) {
    return { name: 'Arabian Sea', level1: 'Middle East' };
  }
  if (lng > 80 && lng < 100 && lat > -10 && lat < 20) {
    return { name: 'Bay of Bengal', level1: 'Indian Ocean' };
  }
  if (lng < 0 && lat < 0) {
    return { name: 'South Atlantic', level1: 'Atlantic Ocean' };
  }
  return { name: 'Open Ocean', level1: 'International Waters' };
}

// Destination names
export const destinations = [
  'SG SIN', 'SINGAPORE', 'HK HKG', 'HONG KONG', 'JP TYO', 'TOKYO',
  'CN SHA', 'SHANGHAI', 'AE DXB', 'DUBAI', 'BR SSZ', 'SANTOS',
  'US LAX', 'LOS ANGELES', 'NL RTM', 'ROTTERDAM', 'KR PUS', 'BUSAN'
];
