export class ManagedClusterMetaInfo {
    resourceUri: string;
    subscriptionId: string;
    resourceGroupName: string;
    managedResourceGroupName: string;
    name: string;
    apiVersion: string;
}

export class ManagedCluster extends ManagedClusterMetaInfo {
    // identity: Identity;
    location: string;
    addonProfiles: any;
    agentPoolProfiles: AgentPoolProfile[];
    dnsPrefix: string;
    fqdn: string;
    kubenetesVersion: string;
    networkProfile: any;
    nodeResourceGroup: string;
    provisioningState: string;
    servicePrincipalProfile: ServicePrincipalProfile;
    windowsProfile: WindowProfile;
    enableRBAC: boolean;
    adminToken?: string;

    diagnosticSettings: DiagnosticSettingsResource[];
}

export class DiagnosticSettingsResource {
    id: string;
    properties: {
        storageAccountId: string
    };
    name: string;
    location: string;
    logAnalyticsDestinationType: string;
    storageAccountConfig: StorageAccountConfig;
}
// managed cluster with admin token
export class Identity {
    principalId: string;
    tenantId: string;
    type: string;
}

export class WindowProfile {
    adminUsername: string;
}

export class AgentPoolProfile {
    name: string;
    count: number;
    osType: string;
    provisioningState: string;
    type: string;
}

export class ServicePrincipalProfile {
    clientId: string;
}
// from https://learn.microsoft.com/en-us/rest/api/monitor/diagnostic-settings/list?tabs=HTTP#diagnosticsettingsresource

export class StorageAccountConfig {
    resourceUri?: string;
    resourceName?: string;
    accountSasToken: string;

}

export class PeriscopeConfig {
    diagnosticRunId?: string;
    linuxTag?: string;
    windowsTag?: string;
    containerName: string;

    storage: StorageAccountConfig;
    analyticResultHref?: string;
    startAt: Date;
}
