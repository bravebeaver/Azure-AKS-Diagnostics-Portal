import { Component, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { switchMap, tap } from 'rxjs/operators';
import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';

import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';

import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';
import { environment } from 'projects/app-service-diagnostics/src/environments/environment';

import {  PeriscopeConfig, PrivateManagedCluster, StorageAccountConfig } from '../../../models/managed-cluster';
import { BehaviorSubject, Observable, of } from 'rxjs';


@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  periscopeConfig: PeriscopeConfig = new PeriscopeConfig();
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;
  statusMessage : string = null;

  _clusterToDiagnose: BehaviorSubject<PrivateManagedCluster> = new BehaviorSubject<PrivateManagedCluster>(null);
  storageConfig: StorageAccountConfig = null;

  diagnosticToolRunningStatus: string[] = [];

  validConfiguration: boolean = false;
  errorMessage: string;

  constructor( 
    private _adminManagedCluster: AdminManagedClustersService) {
      this._adminManagedCluster.currentCluster().subscribe((managedCluster: PrivateManagedCluster )=> {
          this._clusterToDiagnose.next(managedCluster);
    });
  }
  
  ngOnInit() {
    this.setLoadingMessage("Loading cluster information...");
    //update periscope config if storage account is re-configured;
    this._clusterToDiagnose.subscribe((managedCluster: PrivateManagedCluster) => {
      if (managedCluster === null) {
        return;
      }
      this.setLoadingMessage("Cluster loaded...");
      // TODO might toggle storage account later;
      if (!!managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.length > 0) {
        this.setLoadingMessage("Cluster has diagnostic settings, use diagnostic settings ...");
        //TODO which one to use? get drop down from UI and ask user to choose.
        this._adminManagedCluster.populateStorageAccountConfig(managedCluster.diagnosticSettings[0]).subscribe((config: StorageAccountConfig) => {
          this.storageConfig = config;
        });
      } else {
        this.setLoadingMessage("Cluster does not have diagnostic settings, choose a storage account...");
        this.getPeriscopeStorageAccount().subscribe((config: StorageAccountConfig) => {

          this.storageConfig = config;
        });
      } 
    });
  }

  updatePeriscopeRunId() {
   this.periscopeConfig.diagnosticRunId =  moment().format('YYYY-MM-DDTHH:mm:ss');;
  }

  //TODO replace this with the actual storage account info;
  getPeriscopeStorageAccount(): Observable<StorageAccountConfig> {
    const pericopeConfig =  <StorageAccountConfig> {
      resourceName: environment.storageAccountName,
      containerName:  environment.blobContainerName,
      sasToken :environment.sasUri
    };
    return of (pericopeConfig);
  }

  runInClusterPeriscope() {
    this.setLoadingMessage(`Running periscope in cluster...`);

    this._adminManagedCluster.runCommandPeriscope(this.periscopeConfig).pipe(
      tap( (submitCommandResult: RunCommandResult) => {
        this.updatePeriscopeRunId();
      }),
      switchMap( (submitCommandResult: RunCommandResult) => {
        this.updateRunningStatus(`Command submitted with ID - ${submitCommandResult.id}, checking results...`);
        return this._adminManagedCluster.getRunCommandResult(submitCommandResult.id);
      })
    ).subscribe((runCommandResult: RunCommandResult) => {
      const commandResult = runCommandResult.properties.logs.split('\n');
      this.updateRunningStatus(commandResult);
    });

    //TODO poll storage account for results;
  }
  
  updateRunningStatus(messages: string[]|string) {
    this.status = ToolStatus.Loaded;
    this.errorMessage = null;
    this.statusMessage = null;

    if (typeof messages === 'string') {
      this.diagnosticToolRunningStatus.push( messages);
    } else {
      this.diagnosticToolRunningStatus.push( ...messages);
    }
  }

  setLoadingMessage(message: string) {
    this.status = ToolStatus.Loading;
    this.statusMessage = message;
  }

  setErrorMessage(message: string) {
    this.errorMessage = message;
    this.status = ToolStatus.Error;
  }

  // For tooltip display
  directionalHint = DirectionalHint.rightTopEdge;
  toolTipStyles = { 'backgroundColor': 'black', 'color': 'white', 'border': '0px' };

  toolTipOptionsValue: ITooltipOptions = {
    calloutProps: {
      styles: {
        beak: this.toolTipStyles,
        beakCurtain: this.toolTipStyles,
        calloutMain: this.toolTipStyles
      }
    },
    styles: {
      content: this.toolTipStyles,
      root: this.toolTipStyles,
      subText: this.toolTipStyles
    }
  }
}

export enum ToolStatus {
  Loading,
  Loaded,
  Error
}

