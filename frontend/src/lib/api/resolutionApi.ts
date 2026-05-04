/**
 * Legacy compatibility helpers.
 * Resolution is now fully on-chain on Ritual Network.
 */

export interface ScheduleResolutionRequest {
  contractAddress: string;
  endDate: string;
  marketTitle: string;
}

export interface ScheduleResolutionResponse {
  success: boolean;
  jobId?: string;
  message: string;
}

export async function scheduleResolution(_params: ScheduleResolutionRequest): Promise<ScheduleResolutionResponse> {
  void _params;
  return {
    success: false,
    message: 'External scheduling is disabled. Resolution runs on-chain on Ritual Network.'
  };
}

export async function checkBridgeServiceHealth(): Promise<boolean> {
  return false;
}
