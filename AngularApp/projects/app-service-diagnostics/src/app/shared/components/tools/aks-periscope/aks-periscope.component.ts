import { Component, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { switchMap } from 'rxjs/operators';
import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';

import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';

import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';
import { ManagedClustersService } from '../../../../shared-v2/services/managed-clusters.service';
import { environment } from 'projects/app-service-diagnostics/src/environments/environment';

import { ManagedCluster, PeriscopeConfig } from '../../../models/managed-cluster';
import { Observable, of } from 'rxjs';


@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  clusterToDiagnose: ManagedCluster = null;  
  periscopeConfig: PeriscopeConfig = null;

  // UI Stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;
  statusMessage : string = null;
  diagnosticToolRunningStatus: string[] = [];

  validConfiguration: boolean = false;
  errorMessage: string;

  constructor( 
    private _managedClusterService: ManagedClustersService, 
    private _adminManagedCluster: AdminManagedClustersService) {
  }
  
  ngOnInit(){
    //update periscope config if storage account is re-configured;
    this.setLoadingMessage("Loading cluster information...");
    this._managedClusterService.getManagedCluster().subscribe(managedCluster => {
      this.clusterToDiagnose = managedCluster; 
      this.setLoadingMessage("Loading storage account information...");
      this.getPeriscopeStorageAccount().subscribe((config: PeriscopeConfig) => {
        // TODO might toggle storage account later;
        this.periscopeConfig = config;
        this.periscopeConfig.diagnosticRunId = moment().format('YYYY-MM-DDTHH:mm:ss');
        this.diagnosticToolRunningStatus.push(`Current configuration successfully loaded.`);
      });  

      this.status = ToolStatus.Loaded;
    });
  }

  //TODO replace this with the actual storage account info;
  getPeriscopeStorageAccount(): Observable<PeriscopeConfig> {
    const pericopeConfig = new PeriscopeConfig(environment.storageAccountName, environment.blobContainerName, environment.sasUri);
    return of (pericopeConfig);
  }

  runInClusterPeriscope() {
    this.setLoadingMessage(`Running periscope in cluster...`);

    this._adminManagedCluster.runCommandPeriscope(this.periscopeConfig).pipe(
      switchMap( (submitCommandResult: RunCommandResult) => {
        this.updateRunningStatus(`Command submitted with ID - ${submitCommandResult.id}, checking results...`);
        return this._adminManagedCluster.getRunCommandResult(submitCommandResult.id);
      })
    ).subscribe((runCommandResult: RunCommandResult) => {
      const commandResult = runCommandResult.properties.logs.split('\n');
      this.updateRunningStatus(commandResult);
    });
  }
  updateRunningStatus(messages: string[]|string) {
    this.status = ToolStatus.Loaded;

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

