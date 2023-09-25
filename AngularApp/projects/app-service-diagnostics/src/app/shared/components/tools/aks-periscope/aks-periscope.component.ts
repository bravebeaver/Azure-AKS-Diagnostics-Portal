import { Component, Input, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import {publish, switchMap } from 'rxjs/operators';

import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';

import {  PeriscopeConfig, ManagedCluster, StorageAccountConfig, DiagnosticSettingsResource } from '../../../models/managed-cluster';
import { TelemetryService } from 'diagnostic-data';
import { PortalService } from 'projects/app-service-diagnostics/src/app/startup/services/portal.service';
import { Globals } from 'projects/app-service-diagnostics/src/app/globals';
import { SharedStorageAccountService } from 'projects/app-service-diagnostics/src/app/shared-v2/services/shared-storage-account.service';
import { GenericCreateStorageAccountPanelComponent } from 'projects/app-service-diagnostics/src/app/fabric-ui/components/generic-create-storage-account-panel/generic-create-storage-account-panel.component';
import { StorageAccountGlobals } from 'projects/app-service-diagnostics/src/app/storage-account-globals';

@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {



  storageConfig: StorageAccountConfig = new StorageAccountConfig();
  containerName: string = '';
  diagnosticRunId: string = '';
  windowsTag: string = "0.0.13";
  linuxTag: string = "0.0.13";

  diagnosticSettings: DiagnosticSettingsResource[] = [];
  diagnosticSettingSelected: DiagnosticSettingsResource;
  
  //UI stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;
  sessionStatus = SessionStatus;

  toolMessages : string[] = ['Loading...'];
  clusterMessages: string[] = [];

  periscopeSessions: PeriscopeSession[] = [];
  currentCluster: ManagedCluster;

  private RUN_COMMAND_RESULT_POLL_WAIT_MS : number = 30000;
  
  constructor(
    private _managedClusterService: AdminManagedClustersService, 
    private _portalService: PortalService, 
    private _telemetryService: TelemetryService, 
    private _storageGlobals: StorageAccountGlobals, 
    private _sharedStorageAccountService: SharedStorageAccountService ) {
      this._sharedStorageAccountService.changeEmitted$.subscribe(newStorageAccount => {
        this.storageConfig.resourceName = newStorageAccount.name;
      })
  }

  ngOnInit() {
    this._managedClusterService.managedCluster.subscribe((managedCluster: ManagedCluster )=> {

      if (managedCluster === null) {
        this.updateToolMessages("No cluster selected", ToolStatus.Error);
        return;
      }
      this.currentCluster = managedCluster;
      this.updateToolMessages("Cluster loaded", ToolStatus.Loaded);
      
      this.containerName = `periscope-${managedCluster.name}`;
      if (!!managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.length > 0) {
        //TODO which one to use? get drop down from UI and ask user to choose.
        this.diagnosticSettings = managedCluster.diagnosticSettings;
        this.diagnosticSettingSelected = this.diagnosticSettings[0];
        this.onDiagSettingSelectionChange();
      } 
      this.resetSessionConfig();
    });
  }

  onDiagSettingSelectionChange() {
    this._managedClusterService.populateStorageAccountConfig(this.diagnosticSettingSelected).subscribe((config: StorageAccountConfig) => {
      if (!!config) {
        this.storageConfig = config;
      } else {
        this.storageConfig = new StorageAccountConfig()
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

  processNewSession(session: PeriscopeSession) {
    this.periscopeSessions.push(session);

    const periscopeRunCommandState = publish()(this._managedClusterService.runCommandPeriscope(session.config));
    session.status = SessionStatus.Running; 
    // just in case the run command result is not available, we will poll the blob container for the result
    setTimeout(() => {
      if (session.status === SessionStatus.Running) {
        session.status = SessionStatus.Abandoned; 
      }}, this.RUN_COMMAND_RESULT_POLL_WAIT_MS);
    
    periscopeRunCommandState.subscribe(
      (submitCommandResult: RunCommandResult) => {
        this.clusterMessages.push(`Command submitted with ID - ${submitCommandResult.id}`);

        const blobUrl = this._managedClusterService.pollPeriscopeBlobResult(session.config)
        session.resultHref = blobUrl; // if periscope ever runs, it should store its output with this blob url
      }, 
      (error: any) => {
        this.clusterMessages.push(`Error submitting runCommand - ${error}`);
        session.status = SessionStatus.Error;
      }
    );
    
    //to get the run command result
    periscopeRunCommandState.pipe(
      switchMap((submitCommandResult: RunCommandResult) => this._managedClusterService.getRunCommandResult(submitCommandResult.id)),
    ).subscribe(
      (runCommandResult: RunCommandResult) => this.clusterMessages.push(...runCommandResult.properties.logs.split('\n')),
      (error: any) => {
        this.clusterMessages.push(...[`Error retrieving run Periscope result - ${error}.`, ` The cluster might still process it.`]);
        session.status = SessionStatus.Abandoned;     
      }
    );

    periscopeRunCommandState.subscribe(() => this.getPeriscopeLogs(session));
    
    periscopeRunCommandState.connect();
}

  getPeriscopeLogs(session: PeriscopeSession) {
    this.clusterMessages = [];
    //to get the periscope logs from the cluster, it can be optional, and useful in diagnostic cases
    this.clusterMessages.push(`Retrieving periscope logs, it might serveral minutes depending on the size of cluster`); 
    this._managedClusterService.pollPeriscopeLogs(moment.utc(session.startAt)).subscribe(
      (periscopeLogs: string[]) => {
        if (!periscopeLogs || periscopeLogs.length == 0) {
          this.clusterMessages.push(`No logs received yet. keep trying...`);
        } else {
          this.clusterMessages.push(...periscopeLogs);
          session.status = SessionStatus.Finished;
        }
      },
      (error: any) => {
        session.status = SessionStatus.Error;
        this.clusterMessages.push(`Error retrieving periscope logs - ${error}`);
        this.clusterMessages.push(`The job might still be running. Check Blob Container for the result.`);
      }
    );
  }

  openSelectStorageAccountPanel() {
    this._storageGlobals.openCreateStorageAccountPanel = !this._storageGlobals.openCreateStorageAccountPanel;
    this._telemetryService.logEvent("OpenAKSCreateStorageAccountPanel");
    this._telemetryService.logPageView("CreateAKSStorageAccountPanelView");
    // const bladeInfo = {
    //   detailBlade: 'StorageAccountPicker',
    //   extension: 'Microsoft_Azure_Storage',
    //   detailBladeInputs: {
    //     storageAccountIds: [this.storageConfig.resourceUri],
    //   }
    // };
    // this._portalService.getBladeReturnValue().subscribe((containerName: any) => {
    //   console.log("received " + containerName);
    // });
    // this._portalService.openBlade(bladeInfo, 'troubleshoot');
  }

  openSelectBlobContainerPanel() {
    this._telemetryService.logEvent("OpenSelectBlobCobtainerPanel");
    const bladeInfo = {
      detailBlade: 'ContainerPickerBlade',
      extension: 'Microsoft_Azure_Storage',
      detailBladeInputs: {
        storageAccountId: this.storageConfig.resourceUri, 
        selectBlob: '',
        selectMultiple: ''
      }
    };
    this._portalService.getBladeReturnValue().subscribe((containerName: any) => {
      console.log("received " + containerName);
    });
    this._portalService.openBlade(bladeInfo, 'troubleshoot');
  }

  openBlobContainerBlade(session: PeriscopeSession) {
    this._telemetryService.logEvent("OpenPeriscopeResultPanel");
    this._telemetryService.logPageView("PeriscopeResultView");

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
  Abandoned, // error getting logs, or any other unknown error
}

export interface PeriscopeSession {
  config: PeriscopeConfig, 
  status: SessionStatus, 
  startAt: Date,
  resultHref?: string;
}
