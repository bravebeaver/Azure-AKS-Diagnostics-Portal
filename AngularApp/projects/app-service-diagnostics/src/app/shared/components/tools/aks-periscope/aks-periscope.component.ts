import { Component, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';

import { TelemetryService } from 'diagnostic-data';
import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
import { Globals } from '../../../../globals';
import { SharedStorageAccountService } from '../../../../shared-v2/services/shared-storage-account.service';
import { DaasService } from '../../../services/daas.service';

import { ManagedCluster, PeriscopeConfig } from '../../../models/managed-cluster';
import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';
import { ManagedClustersService } from '../../../../shared-v2/services/managed-clusters.service';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';
import { map, switchMap } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  clusterToDiagnose: ManagedCluster = null;  
  periscopeConfig: PeriscopeConfig = null;
  storageAccountName: string = "";
  storageAccountContainerName: string = "";
  storageAccountConnectionString: string = "";
  storageAccountSasString: string = "";
  diagnosticRunId: string  = "";

  // UI Stuff
  status: ToolStatus = ToolStatus.Loading;
  toolStatus = ToolStatus;
  diagnosticToolRunningStatus: string[] = [];

  validConfiguration: boolean = false;
  validationError: string = "";
  errorMessage: string;
  error: any;

  constructor( 
    private globals: Globals, 
    private telemetryService: TelemetryService, 
    private _daasService: DaasService,
    private _sharedStorageAccountService: SharedStorageAccountService, 
    private _managedClusterService: ManagedClustersService, 
    private _adminManagedCluster: AdminManagedClustersService) {
      // use storage account shared service to get storage account
      this._sharedStorageAccountService.changeEmitted$.subscribe(newStorageAccount => {
        this.storageAccountName = newStorageAccount.name;
        this.storageAccountConnectionString = newStorageAccount.connectionString;
        if (this.storageAccountName) {
          this.validationError = "";
        }
      }); 
  }
  
  ngOnInit(){
    //update periscope config if storage account is re-configured;
    this._managedClusterService.getManagedCluster().subscribe(managedCluster => {
      this.clusterToDiagnose = managedCluster;   
      this.status = ToolStatus.CheckingBlobSasUri;
      
      this._adminManagedCluster.getPeriscopeConfig().subscribe(periscopeConfig => {
        if (periscopeConfig) {
          this.periscopeConfig = periscopeConfig; 
          if (periscopeConfig.storageAccountSasToken) {
            this.storageAccountName = this._daasService.getStorageAccountNameFromSasUri(periscopeConfig.storageAccountSasToken);
          } else if (periscopeConfig.storageAccountConnectionString) {
            this.storageAccountName = this._daasService.getStorageAccountNameFromConnectionString(periscopeConfig.storageAccountConnectionString);
          }          
          this.populateSettings();
        } else if (managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.storageAccountName) {
          this.storageAccountName = managedCluster.diagnosticSettings.storageAccountName
        }
      },
      error => {
        this.errorMessage = "Failed while fetching cluster details";
        this.status = ToolStatus.Error;
        this.error = error;
      });

      this.status = ToolStatus.Loaded;

    });
  }

  populateSettings() {
    this.storageAccountContainerName = this.periscopeConfig.storageAccountContainerName;
    this.storageAccountConnectionString = this.periscopeConfig.storageAccountConnectionString;
  }

  startPeriscope() {
    this.validConfiguration = true;
    this.status = ToolStatus.RunningDiagnosticTools;
    this.startPeriscopeInternal().subscribe((result: string) => {
      this.diagnosticToolRunningStatus.push(`command result ...\n ${result}`);
      this.status = ToolStatus.Loaded;
      this.validConfiguration = false;
    });    
  }

  startPeriscopeInternal(): Observable<string> {
    if (this._managedClusterService.isPrivateCluster()) {
      return this.runCommandPersicope().pipe(
        map((runCommandResult: RunCommandResult) => {
          return JSON.stringify(runCommandResult);
        })
      );
    } else {
      return this._adminManagedCluster.runKubectlPeriscope(this.periscopeConfig);
    }
  }

  runCommandPersicope(): Observable<RunCommandResult> {
    return this._adminManagedCluster.runCommandPeriscope(this.periscopeConfig).pipe(
      map((submitCommandResult: RunCommandResult) => {
        this.diagnosticToolRunningStatus.push( `Command submitted with ID - ${JSON.stringify(submitCommandResult)}, checking results...`);
        return submitCommandResult; // dont change anything
      }),
      switchMap( (submitCommandResult: RunCommandResult) => {
        return this._adminManagedCluster.getRunCommandResult(submitCommandResult.id);
      })
    );
  }
    
  toggleStorageAccountPanel() {

  }
  
  validateConfiguration(): boolean {
    // if (this.storageAccountSasString == null || this.storageAccountSasString == "") {
    //   return false;
    // }    

    // if (this.diagnosticRunId == null || this.diagnosticRunId == "") {
    //   return false;
    // }

    return true;
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
  CheckingBlobSasUri,
  Loaded,
  RunningDiagnosticTools,
  Error
}

