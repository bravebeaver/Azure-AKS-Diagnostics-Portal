import { Injectable } from '@angular/core';

import {EMPTY, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ArmService } from '../../shared/services/arm.service';

import { CredentialResult, CredentialResults, RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { ManagedCluster, PeriscopeConfig} from '../../shared/models/managed-cluster';
import { ManagedClustersService } from './managed-clusters.service';

@Injectable()
export class AdminManagedClustersService {

  // the admin client exec kubectl command in cluster, need cluster token and not broadcast to other components
  private clusterToken: CredentialResult[];
  public currentCluster: ManagedCluster;
   
  constructor(private _managedClusterService: ManagedClustersService, 
    private _armService: ArmService) {
      this._managedClusterService.getManagedCluster().subscribe(cluster => {
        this.currentCluster = cluster;
        this.setClientAdminCredentials();
      });
  }

  submitCommandInCluster(command: string, context: string): Observable<RunCommandResult> {
    //POST https://management.azure.com/${resourceUri}/runCommand?api-version=2023-07-01
    return this._armService.post(`${this._armService.createUrl(this.currentCluster.resourceUri)}/runCommand`, {
      command: command,
      clusterToken: this.clusterToken,
      context: context
    }).pipe(map((response: RunCommandResult) => {
      console.log(response);
      return response;
    }));
  }

  runPeriscope(periscopeConfig: PeriscopeConfig): Observable<RunCommandResult> {
    console.log("run periscope with config: ", periscopeConfig);
    return this.submitCommandInCluster("kubectl get nodes", "periscope");
  }

  setClientAdminCredentials() {
    // POST https://management.azure.com/${resourceUri}/listClusterAdminCredential?api-version=2023-07-01
    this._armService.postResourceWithoutEnvelope<CredentialResults, any>(`${this.currentCluster.resourceUri}/listClusterAdminCredential`, false)
      .subscribe((response: CredentialResults) => {
        this.clusterToken = response.kubeconfigs;
    });
  }

  getPeriscopeConfig(): Observable<PeriscopeConfig> {
    // runComand kubectl get configmap periscope -n kube-system -o yaml, for now return empty;
    return EMPTY;
  }

}