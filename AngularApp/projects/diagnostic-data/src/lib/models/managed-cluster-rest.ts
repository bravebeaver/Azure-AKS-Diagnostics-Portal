export class CredentialResult {
    name: string; 
    value: string
}

export class CredentialResults {
    kubeconfigs: CredentialResult[];
}

export class RunCommandResult {
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