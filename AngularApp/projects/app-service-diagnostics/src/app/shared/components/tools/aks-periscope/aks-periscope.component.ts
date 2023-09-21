import { Component, Input, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { catchError, delay, publish, switchMap, tap, timeout } from 'rxjs/operators';
import { Observable,  fromEvent, throwError } from 'rxjs';

import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import * as moment from 'moment';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';

import {  PeriscopeConfig, ManagedCluster, StorageAccountConfig } from '../../../models/managed-cluster';
import { TelemetryService } from 'diagnostic-data';
import { PortalActionService } from '../../../services/portal-action.service';
import { map } from 'highcharts';


@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {


  @Input() storageConfig: StorageAccountConfig = new StorageAccountConfig();
  @Input() containerName: string;
  @Input() diagnosticRunId: string;
  @Input() windowsTag: string = "0.0.13";
  @Input() linuxTag: string = "0.0.13";

  
  //UI stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;
  sessionStatus = SessionStatus;

  toolMessages : string[] = ['Loading...'];
  clusterMessages: string[] = [];

  periscopeSessions: PeriscopeSession[] = [];

  private RUN_COMMAND_RESULT_POLL_WAIT_MS : number = 30000;
  
  constructor(
    private _adminManagedCluster: AdminManagedClustersService, 
    private _portalActionService: PortalActionService, 
    private telemetryService: TelemetryService) {
  }
  
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
        this._adminManagedCluster.populateStorageAccountConfig(managedCluster.diagnosticSettings[0]).subscribe((config: StorageAccountConfig) => {
          this.storageConfig = config;
          this.retrievePeriscopeSessions();
        });
      } else {
        // TODO might toggle storage account later;
        // this.getPeriscopeStorageAccount().subscribe((config: StorageAccountConfig) => {
        //   this.updateStorageAccount(config);
        // });
      } 
      
      this.resetSessionConfig();
    });
  }


  retrievePeriscopeSessions() {
    //TODO read from storage account and the blob container name
    this.periscopeSessions = [];
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

    const periscopeRunCommandState = publish()(this._adminManagedCluster.runCommandPeriscope(session.config));
    session.status = SessionStatus.Running; 
    // just in case the run command result is not available, we will poll the blob container for the result
    setTimeout(() => {
      if (session.status === SessionStatus.Running) {
        session.status = SessionStatus.Abandoned; 
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
    this._adminManagedCluster.pollPeriscopeLogs(moment.utc(session.startAt)).subscribe(
      (periscopeLogs: string[]) => {
        if (!periscopeLogs || periscopeLogs.length == 0) {
          this.clusterMessages.push(`No logs received yet. keep trying...`);
        } else {
          console.log("periscope logs", periscopeLogs.join('\n'));
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

  openStorageContainerBlade(session: PeriscopeSession) {
    this.telemetryService.logEvent("OpenPeriscopeLogPanel");
    this.telemetryService.logPageView("PeriscopeLogPanelView");
    this._portalActionService.openStorageBlade(session.config);
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
