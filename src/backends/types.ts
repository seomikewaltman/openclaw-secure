export interface BackendOptions {
  vault?: string;
  region?: string;
  project?: string;
  vaultName?: string;
  addr?: string;
  config?: string;
  dopplerProject?: string;
  dopplerConfig?: string;
}

export interface SecretBackend {
  readonly name: string;
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
