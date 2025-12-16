// Vessel state from Signal Ocean API
export interface VesselState {
  LatestVesselStateId: string;
  GroupId: number;
  IMO: number;
  VesselClassID: number;
  VesselClass: string;
  VesselTypeID: number;
  VesselType: string;
  TradeID: number;
  Trade: string;
  ScrappedDate: string;
  CommercialOperatorID: number;
  CommercialOperatorIDParent: number;
  IsSeagoing: boolean;
  LastAISID: number;
  LastMovementDateTimeUTC: string;
  Latitude: number;
  Longitude: number;
  Speed: number;
  Draught: number;
  Heading: number;
  Course: number;
  VesselStatusID: number;
  VesselStatus: string;
  VesselVoyageStatusID: number;
  VesselVoyageStatus: string;
  AISDestination: string;
  AISDestinationETA: string;
  AreaID: number;
  AreaName: string;
  AreaIDLevel1: number;
  AreaNameLevel1: string;
  AreaIDLevel2: number;
  AreaNameLevel2: string;
  AreaIDLevel3: number;
  AreaNameLevel3: string;
  ClosestGeoAssetID: number;
  ClosestPortID: number;
  ClosestAreaID: number;
  AisOperationLocationID: number;
  OperationLocationActivityID: number;
  AISDestinationPortID: number;
  CurrentVoyageNumber: number;
  IsArmedGuardOnBoard: boolean;
  BuiltForTradeID: number;
  BuiltForTrade: string;
  ModifiedOn: string;
  // Added for display
  VesselName?: string;
}

// Geofence types
export interface Geofence {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  geofenceType: 'polygon' | 'circle';
  coordinates: [number, number][]; // [lng, lat][]
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  isActive: boolean;
}

// Notification types
export interface Notification {
  id: string;
  clientId: string;
  ruleId?: string;
  typeId: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'delivered' | 'read';
  createdAt: string;
}

// Rule types
export interface ClientRule {
  id: string;
  clientId: string;
  typeId: string;
  name: string;
  condition: Record<string, unknown>;
  filters: Record<string, unknown>;
  settings: Record<string, unknown>;
  isActive: boolean;
  geofenceId?: string;
}

// Evaluator types
export interface EvaluationResult {
  triggered: boolean;
  transition?: 'enter' | 'exit' | 'change' | null;
  context?: Record<string, unknown>;
}

export interface ConditionEvaluator {
  id: string;
  evaluate(
    data: VesselState,
    condition: Record<string, unknown>,
    previousState?: Record<string, unknown>
  ): EvaluationResult;
}

// Socket events
export interface ServerToClientEvents {
  notification: (notification: Notification) => void;
  'notification:batch': (notifications: Notification[]) => void;
  'vessel:update': (vessel: VesselState) => void;
}

export interface ClientToServerEvents {
  subscribe: (data: { clientId: string }) => void;
  'notification:read': (data: { notificationId: string }) => void;
}
