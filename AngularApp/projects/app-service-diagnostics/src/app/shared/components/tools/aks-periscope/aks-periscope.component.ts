import { Component, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { switchMap } from 'rxjs/operators';
import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';

import { TelemetryService } from 'diagnostic-data';
import { RunCommandResult } from 'projects/diagnostic-data/src/lib/models/managed-cluster-rest';

import { Globals } from '../../../../globals';
import { SharedStorageAccountService } from '../../../../shared-v2/services/shared-storage-account.service';
import { AdminManagedClustersService } from '../../../../shared-v2/services/admin-managed-clusters.service';
import { ManagedClustersService } from '../../../../shared-v2/services/managed-clusters.service';
import { DaasService } from '../../../services/daas.service';

import { ManagedCluster, PeriscopeConfig } from '../../../models/managed-cluster';


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
  // to wire the eum to the angular component
  toolStatus = ToolStatus;
  diagnosticToolRunningStatus: string[] = [];

  validConfiguration: boolean = false;
  validationError: string = "";
  errorMessage: string;

  constructor( 
    private globals: Globals, 
    private telemetryService: TelemetryService, 
    private _daasService: DaasService,
    private _sharedStorageAccountService: SharedStorageAccountService, 
    private _managedClusterService: ManagedClustersService, 
    private _adminManagedCluster: AdminManagedClustersService) {
      // use storage account shared service to get storage account
      // this._sharedStorageAccountService.changeEmitted$.subscribe(newStorageAccount => {
      //   this.storageAccountName = newStorageAccount.name;
      //   this.storageAccountConnectionString = newStorageAccount.connectionString;
      //   if (this.storageAccountName) {
      //     this.validationError = "";
      //   }
      // }); 
  }
  
  ngOnInit(){
    //update periscope config if storage account is re-configured;
    this._managedClusterService.getManagedCluster().subscribe(managedCluster => {
      this.clusterToDiagnose = managedCluster;   

      
      // this._adminManagedCluster.getPeriscopeConfig().subscribe(periscopeConfig => {
      //   this.status = ToolStatus.CheckingBlobSasUri;
      //   if (periscopeConfig) {
      //     this.periscopeConfig = periscopeConfig; 
      //     if (periscopeConfig.storageAccountSasToken) {
      //       this.storageAccountName = this._daasService.getStorageAccountNameFromSasUri(periscopeConfig.storageAccountSasToken);
      //     } else if (periscopeConfig.storageAccountConnectionString) {
      //       this.storageAccountName = this._daasService.getStorageAccountNameFromConnectionString(periscopeConfig.storageAccountConnectionString);
      //     }          
      //   //  this.populateSettings();
      //   } else if (managedCluster.diagnosticSettings && managedCluster.diagnosticSettings.storageAccountName) {
      //     this.storageAccountName = managedCluster.diagnosticSettings.storageAccountName
      //   }
      //   this.status = ToolStatus.Loaded;
      // },
      // error => {
      //   this.errorMessage = "Failed while fetching cluster details";
      //   this.status = ToolStatus.Error;
      //   this.error = error;
      // });
    });
  }

  // populateSettings() {
  //   this.storageAccountContainerName = this.periscopeConfig.storageAccountContainerName;
  //   this.storageAccountConnectionString = this.periscopeConfig.storageAccountConnectionString;
  // }

  runInClusterPeriscope() {
    this.validConfiguration = false;
    this.status = ToolStatus.RunningDiagnosticTools;

    this._adminManagedCluster.runCommandPeriscope(this.periscopeConfig).pipe(
      switchMap( (submitCommandResult: RunCommandResult) => {
        this.diagnosticToolRunningStatus.push( `Command submitted with ID - ${submitCommandResult.id}, checking results...`);
        this.status = ToolStatus.Loading;

        return this._adminManagedCluster.getRunCommandResult(submitCommandResult.id);
      })
    ).subscribe((runCommandResult: RunCommandResult) => {
      this.diagnosticToolRunningStatus.push(`command result `);
      this.diagnosticToolRunningStatus.push(`${runCommandResult.properties.logs}`);
      this.status = ToolStatus.Loaded;
      this.validConfiguration = true;
    });
  }

  // toggleStorageAccountPanel() {

  // }
  
  // validateConfiguration(): boolean {
  //   // if (this.storageAccountSasString == null || this.storageAccountSasString == "") {
  //   //   return false;
  //   // }    

  //   // if (this.diagnosticRunId == null || this.diagnosticRunId == "") {
  //   //   return false;
  //   // }

  //   return true;
  // }

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

