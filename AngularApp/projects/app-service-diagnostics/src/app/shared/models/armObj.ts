export interface ArmObj {
    id: string;
    name: string;
    type: string;
    kind: string;
    location: string;
    properties: {
    };
}
export class ArmResourceMetaInfo {
    resourceUri: string;
    subscriptionId: string;
    resourceGroupName: string;
    location: string;
    name: string;
    apiVersion: string;
}
