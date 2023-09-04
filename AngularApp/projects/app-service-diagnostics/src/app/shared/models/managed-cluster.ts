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
  
    diagnosticSettings: InClusterDiagnosticSettings;
}

// managed cluster with admin token
export class PrivateManagedCluster extends ManagedCluster {
    adminToken: string;
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

export class InClusterDiagnosticSettings {
    storageAccountName: string;
}


export class PeriscopeConfig {
    diagnosticRunId: string;
    linuxTag: string;
    windowsTag: string;
    
    storageAccountName: string;
    storageAccountContainerName: string;
    storageAccountSasToken: string;
    storageAccountConnectionString: string;   
}
