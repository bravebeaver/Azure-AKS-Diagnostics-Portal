import { Component, Input, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { switchMap } from 'rxjs/operators';
import { BehaviorSubject} from 'rxjs';

import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';

import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';

import {  PeriscopeConfig, PrivateManagedCluster, StorageAccountConfig } from '../../../models/managed-cluster';

import { ResourceDescriptor } from 'diagnostic-data';


@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  //UI stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;

  storageConfig: StorageAccountConfig = null;
  @Input() storageAccountName: string;
  @Input() storageAccountSasKey: string;
  @Input() containerName: string;


  statusMessage : string[] = [ 'Loading...'];
  diagnosticToolRunningStatus: string[] = [];
  errorMessage: string;

  _clusterToDiagnose$: BehaviorSubject<PrivateManagedCluster> = new BehaviorSubject<PrivateManagedCluster>(null);
  
  constructor(private _adminManagedCluster: AdminManagedClustersService) {

  }
  
  ngOnInit() {
    this.setLoadingMessage("Loading cluster information...");
    this._adminManagedCluster.managedCluster.subscribe((managedCluster: PrivateManagedCluster )=> {

      if (managedCluster === null) {
        return;
      }
      this.updateRunningStatus("Cluster loaded...");
      // TODO might toggle storage account later;
      this.containerName = managedCluster.name + '-periscope';
      if (!!managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.length > 0) {
        this.setLoadingMessage("Cluster has diagnostic settings, loading diagnostic settings ...");
        //TODO which one to use? get drop down from UI and ask user to choose.
        this._adminManagedCluster.populateStorageAccountConfig(managedCluster.diagnosticSettings[0]).subscribe((config: StorageAccountConfig) => {
          this.updateStorageAccount(config);
        });
      } else {
        this.setLoadingMessage("Cluster does not have diagnostic settings, enter your own values for now...");
        // this.getPeriscopeStorageAccount().subscribe((config: StorageAccountConfig) => {
        //   this.updateStorageAccount(config);
        // });
      } 
    });
    //update periscope config if storage account is re-configured;
  }
  updateStorageAccount(config: StorageAccountConfig) {
    this.updateRunningStatus("Storage account updated...");
    this.storageConfig = config;
    const storageAccountDesc = ResourceDescriptor.parseResourceUri(config.resourceUri);
    this.storageAccountName = storageAccountDesc.resource;
    this.storageAccountSasKey = config.sasToken;
  }

  isValidStorageConfig(): boolean {
    let validConfiguration = !!this.storageConfig && !!this.storageConfig.sasToken && !!this.storageConfig.resourceUri;
    console.log(`Current storage condfiguration ${JSON.stringify(this.storageConfig)} is valid? ${validConfiguration}`);
    return validConfiguration;
  }

  runInClusterPeriscope() {
    if (this.isValidStorageConfig()) {
      this.setErrorMessage("Invalid storage account");
      return;
    }
    let periscopeConfig = <PeriscopeConfig>{
      storage : this.storageConfig,
      diagnosticRunId: moment().format('YYYY-MM-DDTHH:mm:ss')
    };

    this.status = ToolStatus.Running;
    this._adminManagedCluster.runCommandPeriscope(periscopeConfig).pipe(
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
    this.statusMessage = [];

    if (typeof messages === 'string') {
      this.diagnosticToolRunningStatus.push( messages);
    } else {
      this.diagnosticToolRunningStatus.push( ...messages);
    }
  }

  setLoadingMessage(message: string) {
    this.status = ToolStatus.Loading;
    this.statusMessage.push(message);
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
  Running,
  Error
}

