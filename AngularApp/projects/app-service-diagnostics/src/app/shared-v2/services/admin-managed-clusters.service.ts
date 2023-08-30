import { Injectable } from '@angular/core';

import {BehaviorSubject, EMPTY, Observable } from 'rxjs';
import { map, mergeMap, filter } from 'rxjs/operators';

import { ArmService } from '../../shared/services/arm.service';

import { CredentialResult, CredentialResults, RunCommandRequest, RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { ManagedCluster, PeriscopeConfig} from '../../shared/models/managed-cluster';
import { ManagedClustersService } from './managed-clusters.service';

@Injectable()
export class AdminManagedClustersService {

  // the admin client exec kubectl command in cluster, need cluster token and not broadcast to other components
  private clusterCredentials: BehaviorSubject<CredentialResult> = new BehaviorSubject<CredentialResult>(null);
  public currentCluster: ManagedCluster;
   
  constructor(private _managedClusterService: ManagedClustersService, 
    private _armService: ArmService) {
      this._managedClusterService.getManagedCluster().subscribe(cluster => {
        this.currentCluster = cluster;
        this.setClientAdminCredentials();
      });
  }

  setClientAdminCredentials() {
    // POST https://management.azure.com/${resourceUri}/listClusterAdminCredential?api-version=2023-07-01
    this._armService.postResourceWithoutEnvelope<CredentialResults, any>(`${this.currentCluster.resourceUri}/listClusterAdminCredential`, false)
      .subscribe((response: CredentialResults) => {
        if (response.kubeconfigs && response.kubeconfigs.length > 0) {
          this.clusterCredentials.next(response.kubeconfigs[0]);
        }
    });
  }

  runCommandInCluster(command: string, context: string): Observable<boolean | {} | RunCommandResult> {
    //POST https://management.azure.com/${resourceUri}/runCommand?api-version=2023-07-01
    return this.clusterCredentials.pipe(
      map((clusterToken: CredentialResult) => {
        return {
          command: command,
          clusterToken: clusterToken.value,
          context: context
        };
      })).pipe(
        mergeMap( (commandRequest: RunCommandRequest) => {
         return this._armService.postResourceWithoutEnvelope<RunCommandResult, RunCommandRequest>(
          `${this.currentCluster.resourceUri}/runCommand`, commandRequest, undefined, true);
      }));
  }

  runPeriscope(periscopeConfig: PeriscopeConfig): Observable<RunCommandResult> {
    return this.runCommandInCluster("kubectl get nodes", "").pipe(
      filter((result: any) => result instanceof RunCommandResult));
  }

  getPeriscopeConfig(): Observable<PeriscopeConfig> {
    // runComand kubectl get configmap periscope -n kube-system -o yaml, for now return empty;
    return EMPTY;
  }

}