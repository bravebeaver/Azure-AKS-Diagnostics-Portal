import { Component, Input, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { switchMap } from 'rxjs/operators';
import { BehaviorSubject} from 'rxjs';

import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';

import {  PeriscopeConfig, ManagedCluster, StorageAccountConfig } from '../../../models/managed-cluster';
import { TelemetryService } from 'diagnostic-data';
import { PortalActionService } from '../../../services/portal-action.service';

@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  //UI stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;

  @Input() storageConfig: StorageAccountConfig = new StorageAccountConfig();
  @Input() containerName: string;
  @Input() diagnosticRunId: string;
  @Input() windowsTag: string = "0.0.13";
  @Input() linuxTag: string = "0.0.13";
  
  collapse = [{ title: 'Config New Session', collapsed: false },
              { title: 'Running Status', collapsed: true },
              { title: 'Historical Sessions', collapsed: true }];

  loadingMessage : string = 'Loading...';
  toolRunningMessages: string[] = [];
  errorMessage: string = null;

  periscopeSessions: PeriscopeConfig[] = [];
  _clusterToDiagnose$: BehaviorSubject<ManagedCluster> = new BehaviorSubject<ManagedCluster>(null);
  
  constructor(
    private _adminManagedCluster: AdminManagedClustersService, 
    private _portalActionService: PortalActionService, 
    private telemetryService: TelemetryService) {
  }
  
  ngOnInit() {
    this._adminManagedCluster.managedCluster.subscribe((managedCluster: ManagedCluster )=> {

      if (managedCluster === null) {
        this.setErrorMessage("No cluster selected");
        return;
      }
      this.loaded();
      this.containerName = `periscope-${managedCluster.name}-${moment().format('YYYY-MM-DD')}`;
      this.diagnosticRunId = moment().format('YYYY-MM-DDTHH:mm:ss');
      if (!!managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.length > 0) {
        //TODO which one to use? get drop down from UI and ask user to choose.
        this._adminManagedCluster.populateStorageAccountConfig(managedCluster.diagnosticSettings[0]).subscribe((config: StorageAccountConfig) => {
          this.storageConfig = config;
          this.retrievePeriscopeSessions();
        });
      } else {

        // this.getPeriscopeStorageAccount().subscribe((config: StorageAccountConfig) => {
        //   this.updateStorageAccount(config);
        // });
      } 
        // TODO might toggle storage account later;
    });
  }


  retrievePeriscopeSessions() {
    //TODO read from storage account and the blob container name
    this.periscopeSessions = [];
  }

  isValidStorageConfig(): boolean {
    //TODO validate storage account sas token?
    return !!this.storageConfig.accountSasToken && !!this.storageConfig.resourceName;
  }

  runInClusterPeriscope() {
    if (!this.isValidStorageConfig()) {
      this.setErrorMessage("Invalid storage account");
      return;
    }

    let periscopeConfig = <PeriscopeConfig>{
      storage : this.storageConfig,
      diagnosticRunId: this.diagnosticRunId,
      containerName: this.containerName,
      linuxTag: this.linuxTag,
      windowsTag: this.windowsTag, 
      startAt: new Date()
    };

    this.prepareNewSession();
    
    this._adminManagedCluster.runCommandPeriscope(periscopeConfig).pipe(
      switchMap( (submitCommandResult: RunCommandResult) => {
        this.updateRunningStatus([`Command submitted with ID - ${submitCommandResult.id}`, `Polling runCommand result...`]);
        return this._adminManagedCluster.getRunCommandResult(submitCommandResult.id);
      })
    ).subscribe((runCommandResult: RunCommandResult) => {
        const commandResult = runCommandResult.properties.logs.split('\n');
        this.updateRunningStatus([...commandResult, `Retrieving periscope logs, it might serveral minutes depending on the size of cluster`]);
        
        this._adminManagedCluster.pollPeriscopeResult(moment.utc(periscopeConfig.startAt)).subscribe((periscopeLogs: string[]) => {
          if (!periscopeLogs || periscopeLogs.length == 0) {
            this.updateRunningStatus([`No logs received yet. keep trying...`]);
          } else {
            this.updateRunningStatus(periscopeLogs);
      
            if (!this.periscopeSessions.some(session => session.diagnosticRunId == periscopeConfig.diagnosticRunId)) {
              this.periscopeSessions.push(periscopeConfig);
            }
          }
        });
    }); 
  }

  prepareNewSession() {
    this.errorMessage = null;
    this.toolRunningMessages = ['Starting new session...'];

    this.collapse[1].collapsed = false;

    this.status = ToolStatus.Running;
  }

  viewLogs(config: PeriscopeConfig) {
    this.telemetryService.logEvent("OpenPeriscopeLogPanel");
    this.telemetryService.logPageView("PeriscopeLogPanelView");
    this._portalActionService.openStorageBlade(config);
  }

  updateMessages(messages: string|string[], status: ToolStatus) {
    this.status = status;

    if (status != ToolStatus.Error) {
      this.errorMessage = null;
    }

    switch (status) {
      case ToolStatus.Loading:
        this.loadingMessage = messages as string;
        break;
      case ToolStatus.Loaded:
        this.loadingMessage = null;
        break;
      case ToolStatus.PollingResult:
        this.toolRunningMessages.push(...(messages as string[]));
        break;
      case ToolStatus.Done:
        this.toolRunningMessages.push(...(messages as string[]));
        break;
      case ToolStatus.Error:
        this.errorMessage = messages as string;
        break;
    }
  }
  
  loaded() {
    this.updateMessages(null, ToolStatus.Loaded);
  }

  updateLoadingMessage(message: string) {
    this.updateMessages(message, ToolStatus.Loading);
  }

  updateRunningStatus(messages: string[]) {
    this.updateMessages(messages, ToolStatus.PollingResult);
  }

  completeRunningStatus(message: string) {
    this.updateMessages([message], ToolStatus.Done);
    this.diagnosticRunId = moment().format('YYYY-MM-DDTHH:mm:ss');
    this.collapse[2].collapsed = false;
  }

  setErrorMessage(message: string) {
    this.updateMessages([message], ToolStatus.Error);
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
  Loading, // when the page is loading
  Loaded, // when the cluster is laoded
  Running, // when a runCommand has been submitted
  PollingResult, // when a runCommand has been submitted and we are polling for result
  Done, // when a runCommand has been submitted and we have the result
  Error
}

