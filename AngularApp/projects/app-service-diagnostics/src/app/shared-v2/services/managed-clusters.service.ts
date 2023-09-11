import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, forkJoin, EMPTY, of } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';

import { AuthService } from '../../startup/services/auth.service';

import { StartupInfo, ResourceType } from '../../shared/models/portal';
import { ArmService } from '../../shared/services/arm.service';
import { ResponseMessageCollectionEnvelope, ResponseMessageEnvelope } from '../../shared/models/responsemessageenvelope';

import { ManagedClusterMetaInfo, ManagedCluster, DiagnosticSettingsResource } from '../../shared/models/managed-cluster';
import { ResourceService } from './resource.service';

//TODO the generic resource service might be just enough
@Injectable()
export class ManagedClustersService {

  public currentClusterMetaInfo: BehaviorSubject<ManagedClusterMetaInfo> = new BehaviorSubject<ManagedClusterMetaInfo>(null);
  public currentCluster: BehaviorSubject<ManagedCluster> = new BehaviorSubject<ManagedCluster>(null);
  public diagnosticSettingsApiVersion =  "2021-05-01-preview";

  constructor(
    protected _authService: AuthService, 
    protected _armClient: ArmService, 
    protected _resourceService: ResourceService
  ) { 
    this._authService.getStartupInfo().pipe(
      filter((startupInfo: StartupInfo) => startupInfo.resourceType === ResourceType.ManagedCluster),

      tap((startUpInfo: StartupInfo) => {
        this._populateManagedClusterMetaInfo(startUpInfo.resourceId)
      }),
      switchMap((startUpInfo: StartupInfo) => {
        return forkJoin([this._armClient.getResource<ManagedCluster>(startUpInfo.resourceId), 
                         this.getResourceDiagnosticSettings(startUpInfo.resourceId)])
        })
    ).subscribe(([managedCluster, diagnosticSettings]: [ResponseMessageEnvelope<ManagedCluster>, DiagnosticSettingsResource[]]) => {
        let currentClusterValue: ManagedCluster = managedCluster.properties;
        currentClusterValue.resourceUri = managedCluster.id;
        currentClusterValue.diagnosticSettings = diagnosticSettings;
        this.currentCluster.next(currentClusterValue);  
      });  
  }

  getResourceDiagnosticSettings(resourceId: string): Observable<DiagnosticSettingsResource[]> {
    const diagnosticSettings: DiagnosticSettingsResource[] = [];
    return this._armClient.getResourceCollection<DiagnosticSettingsResource>(`${resourceId}/providers/Microsoft.Insights/diagnosticSettings`, this.diagnosticSettingsApiVersion)
      .pipe(map((response: {}| ResponseMessageCollectionEnvelope<DiagnosticSettingsResource>)  => {
        if (Object.keys(response).length == 0) {
          return diagnosticSettings;
        } 
        const responseValue =  (response as ResponseMessageCollectionEnvelope<DiagnosticSettingsResource>).value;
        if (responseValue.length == 0) {
          return diagnosticSettings;
        }
        responseValue.map((diagnosticSetting: DiagnosticSettingsResource) => {  
            diagnosticSetting.storageAccountId = diagnosticSetting.storageAccountId;
        });
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
}
  