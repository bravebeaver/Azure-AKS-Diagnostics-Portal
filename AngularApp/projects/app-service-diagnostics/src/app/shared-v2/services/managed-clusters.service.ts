import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../../startup/services/auth.service';

import { StartupInfo, ResourceType } from '../../shared/models/portal';
import { ArmService } from '../../shared/services/arm.service';
import { ResponseMessageEnvelope } from '../../shared/models/responsemessageenvelope';

import { ManagedClusterMetaInfo, ManagedCluster } from '../../shared/models/managed-cluster';
import { ResourceService } from './resource.service';

//TODO the generic resource service might be just enough
@Injectable()
export class ManagedClustersService {

  
  // TODO double check whether we need this, as the cluster info should not change
  public currentClusterMetaInfo: BehaviorSubject<ManagedClusterMetaInfo> = new BehaviorSubject<ManagedClusterMetaInfo>(null);
  public currentCluster: BehaviorSubject<ManagedCluster> = new BehaviorSubject<ManagedCluster>(null);
  
  constructor(
    protected _authService: AuthService, 
    protected _armClient: ArmService, 
    protected _resourceService: ResourceService
  ) { 
    this._authService.getStartupInfo().subscribe((startUpInfo: StartupInfo) => {
      this._populateManagedClusterMetaInfo(startUpInfo.resourceId);
      
      if (startUpInfo.resourceType === ResourceType.ManagedCluster) {
        this._armClient.getResource<ManagedCluster>(startUpInfo.resourceId).subscribe((managedCluster: ResponseMessageEnvelope<ManagedCluster>) => {
          let currentClusterValue: ManagedCluster = managedCluster.properties;
          currentClusterValue.resourceUri = managedCluster.id;
          // currentClusterValue.identity = managedCluster.identity;
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

  isPrivateCluster(): boolean {
    // TODO runCommand is better suited for private cluster, but it is not ready yet
    return false;
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

  
}
  