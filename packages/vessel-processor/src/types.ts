// Vessel state from Signal Ocean API / Kafka
export interface VesselState {
  LatestVesselStateId: string;
  GroupId: number;
  IMO: number;
  VesselName?: string;
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
}

// Geofence definition
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

// Client rule for notifications
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
  geofence?: Geofence;
  notificationType?: NotificationType;
}

// Notification type definition
export interface NotificationType {
  id: string;
  typeId: string;
  name: string;
  description?: string;
  dataSource: string;
  conditionSchema: Record<string, unknown>;
  filterSchema: Record<string, unknown>;
  defaultTemplate: { title: string; message: string };
  stateTracking: { enabled: boolean; fields?: string[] };
  isActive: boolean;
}

// Notification to be delivered
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
  expiresAt: string;
}

// Evaluation result from condition evaluators
export interface EvaluationResult {
  triggered: boolean;
  transition?: 'enter' | 'exit' | 'change' | null;
  context?: Record<string, unknown>;
}

// Rule state for tracking enter/exit/change
export interface RuleState {
  ruleId: string;
  entityId: string;
  state: Record<string, unknown>;
  lastEvaluatedAt: Date;
}

// Redis pub/sub message format
export interface NotificationMessage {
  clientId: string;
  notification: Notification;
}

// Vessel update message for real-time map
export interface VesselUpdateMessage {
  vessel: VesselState;
  timestamp: string;
}
