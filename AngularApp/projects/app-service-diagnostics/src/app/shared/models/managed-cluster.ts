import { OperatingSystem } from "./site";

export class ManagedClusterMetaInfo  {
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
  
    diagnosticSettings: DiagnosticSettingsResource[];
}

export class DiagnosticSettingsResource {
    id: string;
    properties: {
        storageAccountId: string
    };
    name: string
    logAnalyticsDestinationType: string;
    storageAccountId: string;
}
// managed cluster with admin token
export class PrivateManagedCluster extends ManagedCluster {
    adminToken?: string;
}

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
    osType: OperatingSystem;
    provisioningState: string;
    type: string;
}

export class ServicePrincipalProfile {
    clientId: string;
}

// from https://learn.microsoft.com/en-us/rest/api/monitor/diagnostic-settings/list?tabs=HTTP#diagnosticsettingsresource

export class PeriscopeConfig {
    diagnosticRunId?: string;
    linuxTag?: string;
    windowsTag?: string;
    
    storageAccountName: string;
    storageAccountContainerName: string;
    storageAccountSasToken: string;
    storageAccountConnectionString?: string;   

    constructor(storageAccountName: string, storageAccountContainerName: string, storageAccountSasToken: string) {
        this.storageAccountName = storageAccountName;
        this.storageAccountContainerName = storageAccountContainerName;
        this.storageAccountSasToken = storageAccountSasToken;
    }

    validate(): boolean {
        return! (this.storageAccountName == null || 
            this.storageAccountContainerName == null || 
            this.storageAccountSasToken == null);
    }
}
