export interface CredentialResult {
    name: string; 
    value: string; 
    kubeconfig: KubeConfigCredentials;
}

export interface CredentialResults {
    kubeconfigs: CredentialResult[];
}

export interface KubeConfigCredentials {
    apiVersion: string;
    clusters: { name: string, cluster: { server: string, 'certificate-authority-data'?: string } }[];
    contexts: { name: string, context: { cluster: string, user: string } }[];
    users: { name: string, user: { 'client-certificate-data'?: string, 'client-key-data'?: string, token?: string } }[];
  }

export interface K8sContext {
    endpoint: string;
    cacert: string;
    cert: string;
    key: string;
}

export interface RunCommandResult {
    id: string; 
    properties: {
        exitCode: number;
        finishedAt: string;
        logs: string;
        provisionState: string;
        reason: string;
    }
}

export class RunCommandRequest {
    command: string;
    clusterToken: string;
    context: string;
}