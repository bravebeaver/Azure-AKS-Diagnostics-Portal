import { Component, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';
import { switchMap } from 'rxjs/operators';
import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';

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
  periscopeConfig: PeriscopeConfig = new PeriscopeConfig();

  // storageAccountConnectionString: string = "";
  storageAccountSasString: string = "";
  storageAccountName: string = "";
  storageAccountContainerName: string = "";

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
      this.getStorageAccount().subscribe(() => {
        this.validateConfiguration();
      });  

      this.status = ToolStatus.Loaded;
    });
  }

  //TODO replace this with the actual storage account info;
  getStorageAccount(): Observable<boolean> {
    this.setLoadingMessage("Loading storage account information...");

    this.storageAccountName = environment.storageAccountName;
    this.storageAccountContainerName = environment.blobContainerName;
    this.storageAccountSasString = environment.sasUri;
    return of(true);
  }

  runInClusterPeriscope() {
    this.setLoadingMessage("Running periscope in cluster...");

    this._adminManagedCluster.runCommandPeriscope(this.periscopeConfig).pipe(
      switchMap( (submitCommandResult: RunCommandResult) => {
        this.diagnosticToolRunningStatus.push( `Command submitted with ID - ${submitCommandResult.id}, checking results...`);
        this.status = ToolStatus.Loaded;
        return this._adminManagedCluster.getRunCommandResult(submitCommandResult.id);
      })
    ).subscribe((runCommandResult: RunCommandResult) => {
      this.diagnosticToolRunningStatus.push(`${runCommandResult.properties.logs}`);
    });
  }

  setLoadingMessage(message: string) {
    this.status = ToolStatus.Loading;
    this.statusMessage = message;
  }

  validateConfiguration() {
    if (this.storageAccountSasString == null || this.storageAccountName == null || this.storageAccountContainerName == null) {
      this.setErrorMessage( "could not read storage account setup from environment variables");
      this.validConfiguration = false;  
    } else {
      this.validConfiguration = true;  
    }
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

