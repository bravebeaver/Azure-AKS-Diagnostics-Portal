import { Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
//TODO replace with pako
import  * as JSZip  from 'jszip';
import * as yaml from 'yaml';


import {BehaviorSubject,  Observable,  forkJoin,  from, identity, of, timer } from 'rxjs';
import { map, switchMap,takeWhile, takeLast, filter, tap} from 'rxjs/operators';
import { StringUtilities } from "diagnostic-data";

import { ArmService } from '../../shared/services/arm.service';

import { CredentialResult, CredentialResults, KubeConfigCredentials, RunCommandRequest, RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { DiagnosticSettingsResource, ManagedCluster, ManagedClusterMetaInfo, PeriscopeConfig, PrivateManagedCluster, StorageAccountConfig} from '../../shared/models/managed-cluster';
import { AuthService } from '../../startup/services/auth.service';
import { ResourceService } from './resource.service';
import { ResourceType, StartupInfo } from '../../shared/models/portal';
import { ResponseMessageCollectionEnvelope, ResponseMessageEnvelope } from '../../shared/models/responsemessageenvelope';

const RUN_COMMAND_INITIAL_POLL_WAIT_MS: number = 1000;
const RUN_COMMAND_INTERVAL_MS: number = 5000;
const YAML_SEPARATOR: string = "---\n";
@Injectable()
export class AdminManagedClustersService {
  // the admin client exec kubectl command in cluster, need cluster token and not broadcast to other components
  public privateManagedCluster: BehaviorSubject<PrivateManagedCluster> = new BehaviorSubject<PrivateManagedCluster>(null);
  public currentClusterMetaInfo: BehaviorSubject<ManagedClusterMetaInfo> = new BehaviorSubject<ManagedClusterMetaInfo>(null);
  public diagnosticSettingsApiVersion =  "2021-05-01-preview";

  constructor(
    protected _authService: AuthService, 
    protected _resourceService: ResourceService,
    private _armClient: ArmService) {
    
    console.log("constructor called - AdminManagedClustersService");
    this._authService.getStartupInfo().pipe(
      filter((startupInfo: StartupInfo) => startupInfo.resourceType === ResourceType.ManagedCluster),

      map((startUpInfo: StartupInfo) => {
        return this._populateManagedClusterMetaInfo(startUpInfo.resourceId)
      })
    ).pipe(
      switchMap((managedClusterMetaInfo: ManagedClusterMetaInfo) => {
        this.currentClusterMetaInfo.next(managedClusterMetaInfo);
        return forkJoin([
          this._armClient.getResource<ManagedCluster>(managedClusterMetaInfo.resourceUri), 
          this.getClientAdminCredentials(managedClusterMetaInfo.resourceUri)]);
      })
    ).subscribe(([managedCluster, userCredentials]: [ResponseMessageEnvelope<ManagedCluster>, CredentialResult]) => {
      let currentCluster: PrivateManagedCluster = managedCluster.properties;
      currentCluster.resourceUri = managedCluster.id;
      currentCluster.adminToken = userCredentials.kubeconfig.users[0].user.token;

      this.getResourceDiagnosticSettings(currentCluster.resourceUri).subscribe((diagnosticSettings: DiagnosticSettingsResource[]) => {
        currentCluster.diagnosticSettings = diagnosticSettings;
        this.privateManagedCluster.next(currentCluster);
      });
    });
  }

  currentCluster(): Observable<PrivateManagedCluster> {
    return this.privateManagedCluster.pipe(filter(privateManagedCluter  =>  !!privateManagedCluter));
  }

  getResourceDiagnosticSettings(resourceId: string): Observable<DiagnosticSettingsResource[]> {
    const diagnosticSettings: DiagnosticSettingsResource[] = [];
    return this._armClient.getResourceCollection<DiagnosticSettingsResource>(`${resourceId}/providers/Microsoft.Insights/diagnosticSettings`, this.diagnosticSettingsApiVersion)
      .pipe(map((response: {}| ResponseMessageCollectionEnvelope<DiagnosticSettingsResource>)  => {
        if (Object.keys(response).length == 0) {
          return diagnosticSettings;
        } 
        const responseValue =  (response as DiagnosticSettingsResource[]);
        if (responseValue.length == 0) {
          return diagnosticSettings;
        }
        responseValue.forEach((diagnosticSetting: DiagnosticSettingsResource) => {  
          diagnosticSetting.storageAccountId = diagnosticSetting.properties.storageAccountId;
        });
        return responseValue;
      }));
  }

  private _populateManagedClusterMetaInfo(resourceId: string): ManagedClusterMetaInfo {
    const pieces = resourceId.toLowerCase().split('/');
    return <ManagedClusterMetaInfo>{
        resourceUri: resourceId,
        subscriptionId: pieces[pieces.indexOf('subscriptions') + 1],
        resourceGroupName: pieces[pieces.indexOf('resourcegroups') + 1],
        name: pieces[pieces.indexOf('managedclusters') + 1],
    };
  }

  // POST https://management.azure.com/${resourceUri}/listClusterAdminCredential?api-version=2023-07-01
  getClientAdminCredentials(resourceId: string): Observable<CredentialResult> {
    return this._armClient.postResourceWithoutEnvelope<CredentialResults, any>(`${resourceId}/${ManagedClusterCommandApi.LIST_CLUSTER_ADMIN_CREDENTIAL}`, true).pipe(
      map((response: CredentialResults) => {
        if (response.kubeconfigs && response.kubeconfigs.length > 0) {
          if (response.kubeconfigs.length > 1) {
            console.log(`received cluster credentials ${response.kubeconfigs.length}, use the first one only.`);
          }
          let userCredential: CredentialResult = {...response.kubeconfigs[0]};
          userCredential.kubeconfig = yaml.parse(atob(userCredential.value)) as KubeConfigCredentials;
          return userCredential;
        }
      }));
  }

  //POST https://management.azure.com/${resourceUri}/runCommand?api-version=2023-07-01
  private runCommandInCluster(command: string, context: string): Observable<RunCommandResult> {
      return this.privateManagedCluster.pipe(
        switchMap( (privateManagedCluter : PrivateManagedCluster) => {
          const commandRequest: RunCommandRequest = {
            command: command,
            clusterToken: privateManagedCluter.adminToken,
            context: context
          };

        return this._armClient.postResourceFullResponse<RunCommandResult>(
        `${privateManagedCluter.resourceUri}/${ManagedClusterCommandApi.RUN_COMMAND}`, commandRequest, true);
      })
    ).pipe(
      map((runCommandJobResult: HttpResponse<RunCommandResult>) => {
        if (runCommandJobResult.status === 202) {
          const location= runCommandJobResult.headers.get("Location");
          return <RunCommandResult> {
            id: location.substring(
              location.indexOf(ManagedClusterCommandApi.GET_COMMAND_RESULT) + ManagedClusterCommandApi.GET_COMMAND_RESULT.length + 1, location.indexOf("?"))
          };
        } else {
          return runCommandJobResult.body;
        }
      })
    );
  }

  // GET https://management.azure.com/${resourceUri}/commandResults/${commandId}?api-version=2023-07-01
  getRunCommandResult(commandId: string): Observable<RunCommandResult> {
    // TODO implement timeout
    const privateManagedCluter : PrivateManagedCluster = this.privateManagedCluster.getValue();
    return timer(RUN_COMMAND_INITIAL_POLL_WAIT_MS, RUN_COMMAND_INTERVAL_MS).pipe(
      switchMap((retryAttempt: number) => {
          return this._armClient.getResourceFullResponse<RunCommandResult>(`${privateManagedCluter.resourceUri}/${ManagedClusterCommandApi.GET_COMMAND_RESULT}/${commandId}`, true);
      }),
      takeWhile(runCommandResult => {
          // Keep polling until the status is not 202
          return runCommandResult.status == 202;
      }, true),
      takeLast(1))
    .pipe(
      map((runCommandResult: HttpResponse<RunCommandResult>) => runCommandResult.body));  
  }

  runCommandPeriscope(periscopeConfig: PeriscopeConfig): Observable<RunCommandResult> {
    return this.createPeriscopeContext(periscopeConfig).pipe(
      switchMap((periscopeContext: string) => {
        return this.runCommandInCluster(`${InClusterDiagnosticCommands.APPLY} -f ${RunCommandContextConfig.PERISCOPE_MANIFEST}`, periscopeContext);
    }));    
  }

  runCommandKustomizePeriscope(periscopeConfig: PeriscopeConfig): Observable<RunCommandResult> {
    return this.runCommandInCluster(`${InClusterDiagnosticCommands.APPLY} -k ${RunCommandContextConfig.PERISCOPE_KUSTOMIZE_MANIFEST}`, 
    this.createPeriscopeContextUsingKustomize(periscopeConfig));
  }

  createOverlayDir(fileContent: string): Observable<string> {
    return of("");
  }

  createPeriscopeContextUsingKustomize(periscopeConfig: PeriscopeConfig): string {
    const imageTag = "0.0.13";

    const storageConfig = {
      storageAccountName: process.env.STORAGE_ACCOUNT_NAME,
      containerName: process.env.BLOB_CONTAINER_NAME,
      sasKey: process.env.SAS_KEY,
    };

    const kustomizeConfig = `
    resources:
    - https://github.com/azure/aks-periscope//deployment/base?ref=<RELEASE_TAG>
    
    images:
    - name: periscope-linux
      newName: mcr.microsoft.com/aks/periscope
      newTag: ${imageTag}
    - name: periscope-windows
      newName: mcr.microsoft.com/aks/periscope
      newTag: ${imageTag}
    
    secretGenerator:
    - name: azureblob-secret
      behavior: replace
      literals:
      - AZURE_BLOB_ACCOUNT_NAME=${storageConfig.storageAccountName}
      - AZURE_BLOB_CONTAINER_NAME=${storageConfig.containerName}
      - AZURE_BLOB_SAS_KEY=${storageConfig.sasKey}
    
    # Commented-out config values are the defaults. Uncomment to change.
    configMapGenerator:
    - name: diagnostic-config
      behavior: merge
      literals:
      - DIAGNOSTIC_RUN_ID=${periscopeConfig.diagnosticRunId}   
    `;
    return kustomizeConfig;
  }

  // TODO this is rather silly, find another way to interact with kustomize
  createPeriscopeContext(periscopeConfig: PeriscopeConfig): Observable<string> {
    // const nsObject = yaml.parseDocument(createNS);
    // const clusterRoleObject = yaml.parseDocument(createClusterRole);
    const persicopeManifest: string[] = [];
    persicopeManifest.push(namespace,clusterRoleAndBinding, crd, serviceAccount);
    persicopeManifest.push(this.createPeriscopeConfigMap(periscopeConfig), this.createPeriscopeSecretMainfest(periscopeConfig));
    persicopeManifest.push(...this.createPeriscopeLinuxComponents(periscopeConfig)); 
     // TODO only when cluster has windows nodes
    if (this.privateManagedCluster.getValue().windowsProfile) {
      persicopeManifest.push(...this.createPeriscopeWindowsComponents(periscopeConfig)); 
    }  
    return this.zipStringToBase64(persicopeManifest.join(YAML_SEPARATOR), RunCommandContextConfig.PERISCOPE_MANIFEST);
  }

  createPeriscopeWindowsComponents(periscopeConfig: PeriscopeConfig): string[] {
    return [this.createPeriscopeDaemonsetMainfest(periscopeConfig)];
  }
  
  createPeriscopeLinuxComponents(periscopeConfig: PeriscopeConfig): string[] {
   return [this.createPeriscopeDaemonsetLinuxManifest(periscopeConfig)];
  }

  createPeriscopeSecretMainfest(periscopeConfig: PeriscopeConfig) {
    const secretManifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      data: {},
      metadata: {
        name: 'azureblob-secret',
        namespace: 'aks-periscope',
      },
      type: 'Opaque',
    };
    if (periscopeConfig.storage instanceof StorageAccountConfig) {
      const storageConfig = (periscopeConfig.storage as StorageAccountConfig);
      secretManifest.data = {
        AZURE_BLOB_ACCOUNT_NAME: StringUtilities.convertStringToBase64(storageConfig.storageAccountName),
        AZURE_BLOB_CONTAINER_NAME: StringUtilities.convertStringToBase64(storageConfig.storageAccountContainerName),
        AZURE_BLOB_SAS_KEY: StringUtilities.convertStringToBase64(storageConfig.storageAccountSasToken),
      };
    } else {
      
    }
    return  yaml.stringify(secretManifest);
  }

  createPeriscopeConfigMap(periscopeConfig: PeriscopeConfig) {
    const configMapManifest = {
      apiVersion: 'v1',
      data: {
        DIAGNOSTIC_RUN_ID: periscopeConfig.diagnosticRunId,
      },
      kind: 'ConfigMap',
      metadata: {
        name: 'diagnostic-config',
        namespace: 'aks-periscope',
      }
    }; 
   return yaml.stringify(configMapManifest);
  }

  zipStringToBase64(stringToZip: string, filename: string): Observable<string> {
    const zip = new JSZip();
    zip.file(filename, stringToZip);
    return from (zip.generateAsync({type:"base64"})); 
  }

  createPeriscopeDaemonsetLinuxManifest(periscopeConfig: PeriscopeConfig): string {
    const linuxDaemonsetManifest = {
      apiVersion: "apps/v1",
      kind: "DaemonSet",
      metadata: {
        name: "aks-periscope",
        namespace: "aks-periscope",
        labels: {
            app: "aks-periscope"
        }
      },
      spec: {
        selector: {
          matchLabels: {
            app: "aks-periscope"
          }
        },
        template: {
          metadata: {
            labels: {
              app: "aks-periscope"
            }
          },
          spec: {
            serviceAccountName: "aks-periscope-service-account",
            hostPID: true,
            nodeSelector: {
                "kubernetes.io/os": "linux"
            },
            containers: [{
              name: "aks-periscope",
              image: "mcr.microsoft.com/aks/periscope:"+ periscopeConfig.linuxTag,
              securityContext: {
                privileged: true
              },
              imagePullPolicy: "Always",
              env: [{
                name: "HOST_NODE_NAME",
                valueFrom: {
                  fieldRef: {
                    fieldPath: "spec.nodeName"
                  }
                }
              }],
              volumeMounts: [{
                name: "diag-config-volume",
                mountPath: "/config"
              },{
                name: "storage-secret-volume",
                mountPath: "/secret"
              },{
                name: "varlog",
                mountPath: "/var/log"
              },{
                name: "resolvlog",
                mountPath: "/run/systemd/resolve"
              },{
                name: "etcvmlog",
                mountPath: "/etchostlogs"
              }],
              resources: {
                requests: {
                  memory: "40Mi",
                  cpu: "1m"
                },
                limits: {
                  memory: "500Mi",
                  cpu: "1000m"
                }
              }
            }],
            volumes: [{
              name: "diag-config-volume",
              configMap: {
                  name: "diagnostic-config"
              }
            },{
              name: "storage-secret-volume",
              secret: {
                  secretName: "azureblob-secret"
              }
            },{
              name: "varlog",
              hostPath: {
                  path: "/var/log"
              }
            },{
              name: "resolvlog",
              hostPath: {
                  path: "/run/systemd/resolve"
              }
            },{
              name: "etcvmlog",
              hostPath: {
                  path: "/etc"
              }
            }]
          }
        }  
      }
    };
    return yaml.stringify(linuxDaemonsetManifest);
  }

  createPeriscopeDaemonsetMainfest(periscopeConfig: PeriscopeConfig): string {
    const windowsDaemonsetManifest = {
      apiVersion: "apps/v1",
      kind: "DaemonSet",
      metadata: {
        name: "aks-periscope-win",
        namespace: "aks-periscope",
        labels: {
            app: "aks-periscope",
        },
      },
      spec: {
        selector: {
          matchLabels: {
            app: "aks-periscope",
          },
        },
        template: {
          metadata: {
            labels: {
                app: "aks-periscope",
            },
          },
          spec: {
            serviceAccountName: "aks-periscope-service-account",
            hostPID: true,
            nodeSelector: {
              "kubernetes.io/os": "windows",
            },
            containers: [{
              name: "aks-periscope",
              image: "mcr.microsoft.com/aks/periscope:"+ periscopeConfig.windowsTag,
              imagePullPolicy: "Always",
              env: [{
                name: "HOST_NODE_NAME",
                valueFrom: {
                  fieldRef: {
                    fieldPath: "spec.nodeName",
                  },
                },
              }],
              volumeMounts: [{
                name: "diag-config-volume",
                mountPath: "/config",
              },{
                name: "storage-secret-volume",
                mountPath: "/secret",
              },{
                name: "k",
                mountPath: "/k",
              },{
                name: "azuredata",
                mountPath: "/AzureData",
              }],
              resources: {
                requests: {
                  memory: "100Mi",
                  cpu: "100m",
                },
                limits: {
                  memory: "1Gi",
                  cpu: "1000m",
                },
              },
            }],
            volumes: [{
              name: "diag-config-volume",
              configMap: {
                  name: "diagnostic-config",
              },
            },{
              name: "storage-secret-volume",
              secret: {
                secretName: "azureblob-secret",
              },
            },{
              name: "k",
              hostPath: {
                path: "/k",
              },
            },{
              name: "azuredata",
              hostPath: {
                path: "/AzureData",
              },
            }],
          },
        },
      },
    };
    return yaml.stringify(windowsDaemonsetManifest);
  };
}


export enum InClusterDiagnosticCommands {
  GET_CLUSTER_INFO = "kubectl cluster-info",
  GET_NODE = "kubectl get nodes",
  APPLY = "kubectl apply",
}

export enum RunCommandContextConfig {
  
  PERISCOPE_MANIFEST = "periscope.yaml",
  PERISCOPE_KUSTOMIZE_MANIFEST = "periscope",
}

export enum ManagedClusterCommandApi {
  LIST_CLUSTER_ADMIN_CREDENTIAL = "listClusterAdminCredential",
  RUN_COMMAND = "runCommand",
  GET_COMMAND_RESULT = "commandResults"
}

const namespace = `
apiVersion: v1
kind: Namespace
metadata:
  name: aks-periscope
`;

const clusterRoleAndBinding = `
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: aks-periscope-role
rules:
- apiGroups: ["","metrics.k8s.io"]
  resources: ["pods", "nodes"]
  verbs: ["get", "watch", "list"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["list"]
- apiGroups: [""]
  resources: ["pods/portforward"]
  verbs: ["create"]
- apiGroups: ["aks-periscope.azure.github.com"]
  resources: ["diagnostics"]
  verbs: ["get", "watch", "list", "create", "patch"]
- apiGroups: ["apiextensions.k8s.io"]
  resources: ["customresourcedefinitions"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["access.smi-spec.io", "specs.smi-spec.io", "split.smi-spec.io"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["config.openservicemesh.io"]
  resources: ["meshconfigs"]
  verbs: ["get", "list"]
- apiGroups: ["admissionregistration.k8s.io"]
  resources: ["mutatingwebhookconfigurations", "validatingwebhookconfigurations"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: aks-periscope-role-binding
  namespace: aks-periscope
subjects:
- kind: ServiceAccount
  name: aks-periscope-service-account
  namespace: aks-periscope
roleRef:
  kind: ClusterRole
  name: aks-periscope-role
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: aks-periscope-role-binding-view
subjects:
- kind: ServiceAccount
  name: aks-periscope-service-account
  namespace: aks-periscope
roleRef:
  kind: ClusterRole
  name: view
  apiGroup: rbac.authorization.k8s.io
`;

const crd = `
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: diagnostics.aks-periscope.azure.github.com
  namespace: aks-periscope
spec:
  group: aks-periscope.azure.github.com
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              dns:
                type: string
              networkoutbound:
                type: string
              networkconfig:
                type: string
  scope: Namespaced
  names:
    plural: diagnostics
    singular: diagnostic
    kind: Diagnostic
    shortNames:
    - apd
`;


const serviceAccount = `
apiVersion: v1
kind: ServiceAccount
metadata:
  name: aks-periscope-service-account
  namespace: aks-periscope
`;

