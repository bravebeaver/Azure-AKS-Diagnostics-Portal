import { Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
//TODO replace with pako
import  * as JSZip  from 'jszip';
import * as yaml from 'yaml';


import {BehaviorSubject,    Observable, concat,  forkJoin,  from, of, timer } from 'rxjs';
import { map, switchMap,takeWhile, takeLast, filter, mergeMap,  concatMap} from 'rxjs/operators';
import { ResourceDescriptor, StringUtilities } from "diagnostic-data";

import { ArmService } from '../../shared/services/arm.service';

import { CredentialResult, CredentialResults, KubeConfigCredentials, RunCommandRequest, RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { DiagnosticSettingsResource, ManagedCluster,  PeriscopeConfig, StorageAccountConfig} from '../../shared/models/managed-cluster';
import { AuthService } from '../../startup/services/auth.service';
import { ResourceType, StartupInfo } from '../../shared/models/portal';
import { ResponseMessageCollectionEnvelope, ResponseMessageEnvelope } from '../../shared/models/responsemessageenvelope';
import { StorageService } from '../../shared/services/storage.service';
import * as moment from 'moment';
import { Moment } from 'moment';
import { ArmResourceMetaInfo } from '../../shared/models/armObj';


const RUN_COMMAND_INITIAL_POLL_WAIT_MS: number = 1000;
// seems to take that long
const RUN_COMMAND_INTERVAL_MS: number = 5000;
const YAML_SEPARATOR: string = "---\n";
@Injectable()
export class AdminManagedClustersService {


  public managedCluster: BehaviorSubject<ManagedCluster> = new BehaviorSubject<ManagedCluster>(null);
  public currentClusterMetaInfo: BehaviorSubject<ArmResourceMetaInfo> = new BehaviorSubject<ArmResourceMetaInfo>(null);
  public diagnosticSettingsApiVersion = "2021-05-01-preview";
  public RFC_3336: string = "YYYY-MM-DDTHH:mm:ss.SSS[Z]";

  constructor(
    private _authService: AuthService, 
    private _armClient: ArmService, 
    private _storageService: StorageService) {
    
    this._authService.getStartupInfo().pipe(
      filter((startupInfo: StartupInfo) => startupInfo.resourceType === ResourceType.ManagedCluster),
      switchMap((startUpInfo: StartupInfo) => {
        this._populateManagedClusterMetaInfo(startUpInfo.resourceId);

        // get cluster and admin token, both are required for run command
        return forkJoin([
          this._armClient.getResource<ManagedCluster>(startUpInfo.resourceId),
          this.populateAdminCredentials(startUpInfo.resourceId)]);
      })
    ).pipe(
      mergeMap(([managedCluster, adminCredential]: [ResponseMessageEnvelope<ManagedCluster>, CredentialResult]) => {
        console.log(`found ${adminCredential.kubeconfig.users.length} users in admin credential. use the first one`)
        let currentCluster: ManagedCluster = {
          ... managedCluster.properties, 
          name: managedCluster.name,
          resourceUri: managedCluster.id, 
          adminToken: adminCredential.kubeconfig.users[0].user.token
        };

        // the cluster may or may not have diagnostics;
        return this.getResourceDiagnosticSettings(currentCluster.resourceUri).pipe(
          mergeMap((diagnosticSettings: DiagnosticSettingsResource[]) => {
            currentCluster.diagnosticSettings = diagnosticSettings;
            return of(currentCluster);
          })
        );
      })
    ).subscribe((currentCluster: ManagedCluster) => {
      this.managedCluster.next(currentCluster);
    });
  }

  // POST https://management.azure.com/${resourceUri}/listClusterAdminCredential?api-version=2023-07-01
  populateAdminCredentials(resourceId: string): Observable<CredentialResult> {
    return this._armClient.postResourceWithoutEnvelope<CredentialResults, any>(`${resourceId}/${ManagedClusterCommandApi.LIST_CLUSTER_ADMIN_CREDENTIAL}`, true).pipe(
      filter((response: CredentialResults) => response.kubeconfigs && response.kubeconfigs.length > 0),
      map((response: CredentialResults) => { 
        console.log(`found ${response.kubeconfigs.length} admin credentials. use the first one`)
        let userCredential: CredentialResult = {...response.kubeconfigs[0]};
        userCredential.kubeconfig = yaml.parse(atob(userCredential.value)) as KubeConfigCredentials;
        return userCredential;
      })
    );
  }

  getResourceDiagnosticSettings(resourceId: string): Observable<DiagnosticSettingsResource[]> {
    return this._armClient.getResourceCollection<DiagnosticSettingsResource>(`${resourceId}/providers/Microsoft.Insights/diagnosticSettings`, this.diagnosticSettingsApiVersion)
    .pipe(
      map((response: {}|ResponseMessageCollectionEnvelope<DiagnosticSettingsResource>) => {
        if (!!response) {
          return response as DiagnosticSettingsResource[];
        } else {
          console.log(`no diagnostic settings found for ${resourceId}`);
          return [];
        }
      }));
  }

  //https://learn.microsoft.com/en-us/rest/api/storageservices/list-blobs?tabs=azure-ad
  pollPeriscopeBlobResult(periscopeConfig: PeriscopeConfig): string {
      //https://docs.microsoft.com/en-us/rest/api/storagerp/blobcontainers/create
    var params = [`prefix=${encodeURIComponent(periscopeConfig.diagnosticRunId)}`, `showonly=directories`, `restype=container`, `comp=list`].join("&");
    return `https://${periscopeConfig.storage.resourceName}.blob.core.windows.net/${periscopeConfig.containerName}?${params}`;
  }


  populateStorageAccountConfig(diagnosticSetting: DiagnosticSettingsResource): Observable<StorageAccountConfig> {
    const resourceUri = diagnosticSetting.properties.storageAccountId;
        
    return this._storageService.generateSasKey(resourceUri, '').pipe(
      map((sasKey: string) => {
        const storageAccountDesc = ResourceDescriptor.parseResourceUri(resourceUri);
        return <StorageAccountConfig>{
          accountSasToken: sasKey,  
          resourceUri: resourceUri, 
          resourceName: storageAccountDesc.resource, 
          subscriptionId: storageAccountDesc.subscription
        };
      }));
  };

  private _populateManagedClusterMetaInfo(resourceId: string) {
    const pieces = resourceId.toLowerCase().split('/');
    const managedClusterMetaInfo = <ArmResourceMetaInfo>{
        resourceUri: resourceId,
        subscriptionId: pieces[pieces.indexOf('subscriptions') + 1],
        resourceGroupName: pieces[pieces.indexOf('resourcegroups') + 1],
        name: pieces[pieces.indexOf('managedclusters') + 1],
    };
    this.currentClusterMetaInfo.next(managedClusterMetaInfo);
  }


  //POST https://management.azure.com/${resourceUri}/runCommand?api-version=2023-07-01
  private runCommandInCluster(command: string, context?: string): Observable<RunCommandResult> {
    console.log(`runCommand ${command} in cluster`);
      return this.managedCluster.pipe(
        switchMap( (privateManagedCluter : ManagedCluster) => {
          const commandRequest: RunCommandRequest = {
            command: command,
            clusterToken: privateManagedCluter.adminToken,
            context: context || ""
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
    const privateManagedCluter : ManagedCluster = this.managedCluster.getValue();
    return timer(RUN_COMMAND_INITIAL_POLL_WAIT_MS, RUN_COMMAND_INTERVAL_MS).pipe(
      switchMap(() => {
        return this._armClient.getResourceFullResponse<RunCommandResult>(`${privateManagedCluter.resourceUri}/${ManagedClusterCommandApi.GET_COMMAND_RESULT}/${commandId}`, true);
      }),
      takeWhile(runCommandResult => {
          // Keep polling until the status is not 202
          return runCommandResult.status == 202;
      }, true),
      takeLast(1)
    ).pipe(
      map((runCommandResult: HttpResponse<RunCommandResult>) => runCommandResult.body)
    );  
  }

  runCommandPeriscope(periscopeConfig: PeriscopeConfig): Observable<RunCommandResult> {
    return forkJoin([
        this._storageService.createContainerIfNotExists(periscopeConfig.storage.resourceUri, periscopeConfig.containerName), 
        this.createPeriscopeContext(periscopeConfig)])
      .pipe(
        switchMap(([containerCreated, periscopeContext]: [boolean, string]) => {
          return this.runCommandInCluster(`${InClusterDiagnosticCommands.APPLY} -f ${RunCommandContextConfig.PERISCOPE_MANIFEST}`, periscopeContext);
      }));
  }
    
  pollPeriscopeLogs(since: Moment): Observable<string[]> {  
    return this.retrievePeriscopeLogs(since).pipe(
      concatMap((logs: string[]) => {
        let [finished, lastTimestmap] = this.parsePeriscopeLogs(logs); 
        if (!finished) {
          logs.push(`Periscope is still running, polling more logs...`);
          return concat(
            of(logs), 
            this.pollPeriscopeLogs(lastTimestmap || since)
          );
        }
        console.log("finished polling periscope logs");
        return of(logs);
      })
    );
  }

  parsePeriscopeLogs(logs: string[]): [boolean, Moment] {
    let lastTimestamp: Moment = null;
    let finished = false;
    if (!logs || logs.length == 0) {
      return [finished, lastTimestamp];
    }
    
    const lastLine = logs[logs.length-1];
    // parse the string in the formatm of 2023/09/14 23:33:11 Completed Periscope run 2023-09-15T11:32:23
    const logParts = lastLine.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) (.*)/);
    if (logParts) {
      lastTimestamp = moment(logParts[1], "YYYY/MM/DD HH:mm:ss").utc();
      finished = logParts[2].indexOf("Completed Periscope run") >= 0;
    } 
    return [finished, lastTimestamp];
  }
  
  retrievePeriscopeLogs(since: Moment): Observable<string[]> {
    return this.runCommandInCluster(`${InClusterDiagnosticCommands.GET_PERISCOPE_LOGS} --since-time=${since.format(this.RFC_3336)}`).pipe(
      switchMap((submitCommandResult: RunCommandResult) => {
        return this.getRunCommandResult(submitCommandResult.id)
      })
    ).pipe(
      map((runCommandResult: RunCommandResult) => {
        if(!!runCommandResult.properties && !!runCommandResult.properties.logs) {
          return runCommandResult.properties.logs.trim().split('\n');
        } else {
          return [];
        }
      })
    );
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
    if (this.managedCluster.getValue().windowsProfile) {
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

    const storageConfig = periscopeConfig.storage;
    secretManifest.data = {
      AZURE_BLOB_ACCOUNT_NAME: StringUtilities.convertStringToBase64(storageConfig.resourceName),
      AZURE_BLOB_CONTAINER_NAME: StringUtilities.convertStringToBase64(periscopeConfig.containerName),
      AZURE_BLOB_SAS_KEY: StringUtilities.convertStringToBase64('?' + storageConfig.accountSasToken),
    };
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
  GET_PERISCOPE_LOGS = "kubectl logs -n aks-periscope -l app=aks-periscope",
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

