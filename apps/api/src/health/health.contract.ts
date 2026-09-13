export const HEALTH_STATUS = {
  HEALTHY: "healthy",
  UNHEALTHY: "unhealthy",
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

export const DATABASE_STATUS = {
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
} as const;

export type DatabaseStatus = (typeof DATABASE_STATUS)[keyof typeof DATABASE_STATUS];

export interface HealthResponse {
  status: HealthStatus;
  database: DatabaseStatus;
  checkedAt: string;
}
