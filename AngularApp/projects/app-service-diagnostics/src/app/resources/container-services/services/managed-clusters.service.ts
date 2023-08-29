import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { ManagedClusterMetaInfo, ManagedCluster,  InClusterDiagnosticSettings, PeriscopeConfig } from '../../../shared/models/managed-cluster';
import { map, mergeMap } from 'rxjs/operators';
import { DaasStorageConfiguration } from '../../../shared/models/daas';

import { AuthService } from '../../../startup/services/auth.service';
import { StartupInfo, ResourceType } from '../../../shared/models/portal';
import { ArmService } from '../../../shared/services/arm.service';
import { ResponseMessageEnvelope } from '../../../shared/models/responsemessageenvelope';
import { StorageAccount } from '../../../shared/models/storage';

@Injectable({
  providedIn: 'root'
})
export class ManagedClustersService {
  
  
  public currentClusterMetaInfo: BehaviorSubject<ManagedClusterMetaInfo> = new BehaviorSubject<ManagedClusterMetaInfo>(null);
  public currentCluster: BehaviorSubject<ManagedCluster> = new BehaviorSubject<ManagedCluster>(null);
  
  constructor(
    protected _authService: AuthService, 
    protected _armClient: ArmService
  ) { 
    this._authService.getStartupInfo().subscribe((startUpInfo: StartupInfo) => {
      this._populateManagedClusterMetaInfo(startUpInfo.resourceId);
      
      if (startUpInfo.resourceType === ResourceType.ManagedCluster) {
        this._armClient.getResource<ManagedCluster>(startUpInfo.resourceId).subscribe((managedCluster: ResponseMessageEnvelope<ManagedCluster>) => {
          let currentClusterValue: ManagedCluster = managedCluster.properties;
          currentClusterValue.resourceUri = managedCluster.id;
          // currentClusterValue.identity = managedCluster.identity;
          currentClusterValue.name = managedCluster.name; 
          currentClusterValue.location = managedCluster.location;
          //TODO  check whether cluster has configured diagnostic settings, now just return empty
          currentClusterValue.diagnosticSettings = null;
          this.currentCluster.next(currentClusterValue);
        });
      } 
    });
  }

  getManagedCluster(): Observable<ManagedCluster> {
    return this.currentCluster.pipe(map(cluster => {
      if (cluster) {
        return cluster;
      }
    }));
  }

  private _populateManagedClusterMetaInfo(resourceId: string): void {
    const pieces = resourceId.toLowerCase().split('/');
    this.currentClusterMetaInfo.next(<ManagedClusterMetaInfo>{
        resourceUri: resourceId,
        subscriptionId: pieces[pieces.indexOf('subscriptions') + 1],
        resourceGroupName: pieces[pieces.indexOf('resourcegroups') + 1],
        name: pieces[pieces.indexOf('managedclusters') + 1],
    });
  }

  getPeriscopeConfig(): Observable<PeriscopeConfig> {
    // TODO check whether the cluster has periscope daemonset deployed already
    return of(null)
  }
  
}
  