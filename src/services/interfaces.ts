export interface IStreamingService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export interface IConferenceService {
  joinRoom(roomId: string): Promise<void>;
  leaveRoom(): Promise<void>;
}

export interface IEditorService {
  openSession(recordingId: string): Promise<void>;
}

export interface IAIService {
  analyzeRecording(recordingId: string): Promise<void>;
}

export interface IAccountsBillingService {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
