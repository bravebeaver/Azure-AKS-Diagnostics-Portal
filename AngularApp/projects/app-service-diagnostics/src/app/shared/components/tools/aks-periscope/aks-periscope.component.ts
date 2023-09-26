import { Component, Input, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import {  publish, switchMap} from 'rxjs/operators';

import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';

import {  PeriscopeConfig, ManagedCluster, StorageAccountConfig, DiagnosticSettingsResource } from '../../../models/managed-cluster';
import { TelemetryService } from 'diagnostic-data';
import { PortalService } from 'projects/app-service-diagnostics/src/app/startup/services/portal.service';
import { PortalActionService } from '../../../services/portal-action.service';


@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  constructor(
    private _adminManagedCluster: AdminManagedClustersService, 
    private _portalService: PortalService, 
    private telemetryService: TelemetryService) {
  }

  storageAccountUri: string;
  containerName: string;
  diagnosticRunId: string;

  diagnosticSettings: DiagnosticSettingsResource[] = [new DiagnosticSettingsResource()];
  diagnosticSettingSelected: DiagnosticSettingsResource;

  storageConfig: StorageAccountConfig = new StorageAccountConfig();
  windowsTag: string = "0.0.13";
  linuxTag: string = "0.0.13";

  periscopeSessions: PeriscopeSession[] = [];
  
  //UI stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;
  sessionStatus = SessionStatus;

  toolMessages : string[] = ['Loading...'];
  clusterMessages: string[] = [];

  shareWithAKSExitConfirmationHidden: boolean = true;
  expirySettings = [{displayName: '30 min, should be long enough for 1 complete run', value:''}, 
  {displayName: '1 day, ideal for troubleshooting cluster issues with other diagnotistic tools', value:''}, 
  {displayName: '1 momth, retained for longer term to compare with other periscope sessions', value:''}]

  private RUN_COMMAND_RESULT_POLL_WAIT_MS : number = 30000;
  
  ngOnInit() {
    this._adminManagedCluster.managedCluster.subscribe((managedCluster: ManagedCluster )=> {

      if (managedCluster === null) {
        this.updateToolMessages("No cluster selected", ToolStatus.Error);
        return;
      }
      this.updateToolMessages("Cluster loaded", ToolStatus.Loaded);
      
      this.containerName = `periscope-${managedCluster.name}`;
      if (!!managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.length > 0) {
        //TODO which one to use? get drop down from UI and ask user to choose.
        this.diagnosticSettings.push(...managedCluster.diagnosticSettings);
        this.diagnosticSettingSelected = this.diagnosticSettings[0];
        // this.onStorageAccountResourceUriChange(this.diagnosticSettingSelected.properties.storageAccountId);
      } 
      this.resetSessionConfig();
    });
  }

  onDiagSettingSelectionChange() {
    if (!!this.diagnosticSettingSelected.properties.storageAccountId) {
      this.onStorageAccountResourceUriChange(this.diagnosticSettingSelected.properties.storageAccountId);
    } else {
      this.storageConfig = new StorageAccountConfig();
    }
  }
  onStorageAccountResourceUriChange(storageAccountResourceUri: string) {
    if (!storageAccountResourceUri) {
      this.storageConfig = new StorageAccountConfig();
      return;
    }
    this._adminManagedCluster.populateStorageAccountConfigById(storageAccountResourceUri).subscribe(
      (config: StorageAccountConfig) => {
        if (!!config) {
          this.storageConfig = config;
          if (this.storageConfig.resourceUri != this.diagnosticSettingSelected.properties.storageAccountId) {
            this.diagnosticSettingSelected = this.diagnosticSettings[0];
          }
        } else {
          this.storageConfig = new StorageAccountConfig();
          this.updateToolMessages("Invalid storage account", ToolStatus.Error);
        }
    });
  }

  resetSessionConfig() {
    this.toolMessages = [];
    this.clusterMessages = [];

    this.diagnosticRunId = moment().format('YYYY-MM-DDTHH:mm:ss');
  }

  isValidStorageConfig(): boolean {
    //TODO validate storage account sas token?
    return !!this.storageConfig.accountSasToken && !!this.storageConfig.resourceName;
  }

  isProcessingNewSession(): boolean {
    //when any session is still in created state, aka not running or later
     return this.periscopeSessions.some(session => session.status === SessionStatus.Created);
  }
  
  hasRunningSession(): boolean {
    //when any session is still in created state, aka not running or later
     return this.periscopeSessions.some(session => session.status === SessionStatus.Running);
  }

  runInClusterPeriscope() {
    if (!this.isValidStorageConfig()) {
      this.updateToolMessages("Invalid storage account", ToolStatus.Error);
      return;
    }
    if (this.isProcessingNewSession()) {
      this.updateToolMessages("There is another session waiting to be run", ToolStatus.Error);
      return;
    }

    this.processNewSession( <PeriscopeSession> {
      config: <PeriscopeConfig>{
        storage : this.storageConfig,
        diagnosticRunId: this.diagnosticRunId,
        containerName: this.containerName,
        linuxTag: this.linuxTag,
        windowsTag: this.windowsTag, 
      }, 
      status: SessionStatus.Created, 
      startAt: new Date(),
    });
  }

  toggleStorageAccountPanel() {
    this.telemetryService.logEvent("OpenCreateStorageAccountPanel");
    this.telemetryService.logPageView("CreateStorageAccountPanelView");
  }

  processNewSession(session: PeriscopeSession) {
    //take a deep copy to start the session to avoid UI messup
    this.periscopeSessions.push(session);

    this.diagnosticRunId = moment().format('YYYY-MM-DDTHH:mm:ss');
    const periscopeRunCommandState = publish()(this._adminManagedCluster.runCommandPeriscope(session.config));
    session.status = SessionStatus.Running; 
    // just in case the run command result is not available, we will poll the blob container for the result
    setTimeout(() => {
      if (session.status === SessionStatus.Running) {
        session.status = SessionStatus.Error; 
      }}, this.RUN_COMMAND_RESULT_POLL_WAIT_MS);
    
    periscopeRunCommandState.subscribe(
      (submitCommandResult: RunCommandResult) => {
        this.clusterMessages.push(`Command submitted with ID - ${submitCommandResult.id}`);

        const blobUrl = this._adminManagedCluster.pollPeriscopeBlobResult(session.config)
        session.resultHref = blobUrl; // if periscope ever runs, it should store its output with this blob url
      }, 
      (error: any) => {
        this.clusterMessages.push(`Error submitting runCommand - ${error}`);
        session.status = SessionStatus.Error;
      }
    );
    
    //to get the run command result
    periscopeRunCommandState.pipe(
      switchMap((submitCommandResult: RunCommandResult) => this._adminManagedCluster.getRunCommandResult(submitCommandResult.id)),
    ).subscribe(
      (runCommandResult: RunCommandResult) => this.clusterMessages.push(...runCommandResult.properties.logs.split('\n')),
      (error: any) => {
        this.clusterMessages.push(...[`Error retrieving run Periscope result - ${error}.`, ` The cluster might still process it.`]);
        session.status = SessionStatus.Error;     
      }
    );

    periscopeRunCommandState.subscribe(() => this.getPeriscopeLogs(session));
    
    periscopeRunCommandState.connect();
  }

  getPeriscopeLogs(session: PeriscopeSession) {
    this.clusterMessages = [];
    //to get the periscope logs from the cluster, it can be optional, and useful in diagnostic cases
    this.clusterMessages.push(`Retrieving periscope logs, it might serveral minutes depending on the size of cluster`); 
    this._adminManagedCluster.pollPeriscopeLogs(moment.utc(session.startAt)).subscribe(
      (periscopeLogs: string[]) => {
        this.clusterMessages.push(...periscopeLogs);
        session.status = SessionStatus.Finished;
      },
      (error: any) => {
        session.status = SessionStatus.Error;
        this.clusterMessages.push(`Error retrieving periscope logs - ${error}`);
        this.clusterMessages.push(`The job might still be running. Check Blob Container for the result.`);
      }
    );
  }

  sharePeriscopeSessionWithAKS(session: PeriscopeSession) {
    this.telemetryService.logEvent("OpenSharePeriscopeResultPanel");
    this.telemetryService.logPageView("PeriscopeShareResultView");
  }

  showExitConfirmationDialog = (show: boolean = true) => {
    this.shareWithAKSExitConfirmationHidden = !show;
  }


  openStorageContainerBlade(session: PeriscopeSession) {
    this.telemetryService.logEvent("OpenPeriscopeResultPanel");
    this.telemetryService.logPageView("PeriscopeResultView");

    const bladeInfo = {
      detailBlade: 'BlobsBlade',
      extension: 'Microsoft_Azure_Storage',
      detailBladeInputs: {
        storageAccountId: session.config.storage.resourceUri,
        path: session.config.containerName
      }
    };
    this._portalService.openBlade(bladeInfo, 'troubleshoot');
  }

  shareDiagnosticResultWithAKS() {
    console.log("share your logs away!");
  }

  openSelectStorageAccountBlade() {
  this.telemetryService.logEvent("OpenCreateDiagnosticSettingPanel");
      this.telemetryService.logPageView("CreateDiagnosticSettingPeriscopeView");

      const bladeInfo = {
        detailBlade: 'StorageExplorerBlade',
        extension: 'Microsoft_Azure_Storage',
        detailBladeInputs: {
          // storageAccountId: session.config.storage.resourceUri,
          // path: session.config.containerName
        }
      };
      this._portalService.openBlade(bladeInfo, 'troubleshoot');
  }

  updateToolMessages(arg: string|string[], status: ToolStatus) {
    // reset status message if we are not in error state
    if (  this.status == ToolStatus.Error && status != ToolStatus.Error) {
      this.toolMessages = [];
    }
    this.status = status;
    const toUpdate = Array.isArray(arg) ? arg : [arg];
    this.toolMessages.push(...toUpdate);
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
  Error, // when the page itself has errors
}

export enum SessionStatus {
  Created, // when the session is created
  Running, // when the session is running 
  Error, // when there is any error during the session, can be timeout or failure to connect to cluster
  Finished, // when the actual workload is completed on the cluster
  // Abandoned, // error getting logs, or any other unknown error
}

export interface PeriscopeSession {
  config: PeriscopeConfig, 
  status: SessionStatus, 
  startAt: Date,
  resultHref?: string;
}
