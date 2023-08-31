import { Injectable } from '@angular/core';

import {BehaviorSubject, EMPTY, Observable, timer } from 'rxjs';
import { map, mergeMap, filter, switchMap, retryWhen, repeatWhen, takeWhile, takeLast } from 'rxjs/operators';

import { ArmService } from '../../shared/services/arm.service';

import { CredentialResult, CredentialResults, RunCommandRequest, RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { ManagedCluster, PeriscopeConfig} from '../../shared/models/managed-cluster';
import { ManagedClustersService } from './managed-clusters.service';
import { HttpResponse } from '@angular/common/http';

const RUN_COMMAND_INITIAL_POLL_WAIT_MS: number = 1000;
const RUN_COMMAND_INTERVAL_MS: number = 5000;
const RUN_COMMAND_TIMEOUT_MS: number = 380000; 

@Injectable()
export class AdminManagedClustersService {
  // the admin client exec kubectl command in cluster, need cluster token and not broadcast to other components
  private clusterCredentials$: BehaviorSubject<CredentialResult> = new BehaviorSubject<CredentialResult>(null);

  public currentCluster: ManagedCluster;
  
  constructor(private _managedClusterService: ManagedClustersService, 
    private _armService: ArmService) {
      this._managedClusterService.getManagedCluster().subscribe(cluster => {
        this.currentCluster = cluster;
        this.getClientAdminCredentials();
      });
  }

  getClientAdminCredentials() {
    // POST https://management.azure.com/${resourceUri}/listClusterAdminCredential?api-version=2023-07-01
    this._armService.postResourceWithoutEnvelope<CredentialResults, any>(`${this.currentCluster.resourceUri}/${ManagedClusterCommandApi.LIST_CLUSTER_ADMIN_CREDENTIAL}`, false)
      .subscribe((response: CredentialResults) => {
        if (response.kubeconfigs && response.kubeconfigs.length > 0) {
          this.clusterCredentials$.next(response.kubeconfigs[0]);
        }
    });
  }

  // TOOD whitelist commands
  runCommandInCluster(command: string, context: string): Observable<RunCommandResult> {
    //POST https://management.azure.com/${resourceUri}/runCommand?api-version=2023-07-01
    return this.clusterCredentials$.pipe(
        map((clusterToken: CredentialResult) => {
          return {
            command: command,
            clusterToken: clusterToken.value,
            context: context
          };
        })
      ).pipe(
        switchMap( (commandRequest: RunCommandRequest) => {
          return this._armService.postResourceFullResponse<RunCommandResult>(
          `${this.currentCluster.resourceUri}/${ManagedClusterCommandApi.RUN_COMMAND}`, commandRequest, true);
        })
      ).pipe(
        map((runCommandJobResult: HttpResponse<RunCommandResult>) => {
          if (runCommandJobResult.status === 202) {
            let location= runCommandJobResult.headers.get("Location");
            return <RunCommandResult> {
              id: location.substring(
                location.indexOf(ManagedClusterCommandApi.GET_COMMAND_RESULT) + ManagedClusterCommandApi.GET_COMMAND_RESULT.length + 1, location.indexOf("?"))
            };
            // parse header https://management.azure.com/${resourceUri}/commandResults/${commandId}?api-version=2023-07-01
          } else {
            return runCommandJobResult.body;
          }
        })
      );
  }

  getRunCommandResult(commandId: string): Observable<RunCommandResult> {
    // GET https://management.azure.com/${resourceUri}/commandResults/${commandId}?api-version=2023-07-01
    return timer(RUN_COMMAND_INITIAL_POLL_WAIT_MS, RUN_COMMAND_INTERVAL_MS).pipe(
      switchMap((retryAttempt: number) => {
          return this._armService.getResourceFullResponse<RunCommandResult>(`${this.currentCluster.resourceUri}/${ManagedClusterCommandApi.GET_COMMAND_RESULT}/${commandId}`, true);
      }),
      takeWhile(runCommandResult => {
          // Keep polling until the status is 202
          return runCommandResult.status == 202;
      }, true),
      takeLast(1)).pipe(
        map((runCommandResult: HttpResponse<RunCommandResult>) => runCommandResult.body)
      );
  }

  runPeriscope(periscopeConfig: PeriscopeConfig): Observable<RunCommandResult> {
    return this.runCommandInCluster(InClusterDiagnosticCommands.GET_NODE, "");
  }

  getPeriscopeConfig(): Observable<PeriscopeConfig> {
    // runComand kubectl get configmap periscope -n kube-system -o yaml, for now return empty;
    return EMPTY;
  }
}

export enum InClusterDiagnosticCommands {
  CLUSTER_INFO = "kubectl cluster-info",
  GET_NODE = "kubectl get nodes",
}

export enum ManagedClusterCommandApi {
  LIST_CLUSTER_ADMIN_CREDENTIAL = "listClusterAdminCredential",
  RUN_COMMAND = "runCommand",
  GET_COMMAND_RESULT = "commandResults"
}