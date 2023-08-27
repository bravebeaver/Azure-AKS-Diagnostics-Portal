import { Component, OnInit } from '@angular/core';
import { ITooltipOptions } from '@angular-react/fabric/lib/components/tooltip';

import { TelemetryService, TelemetryEventNames } from 'diagnostic-data';
import { Globals } from '../../../../globals';
import { DirectionalHint } from 'office-ui-fabric-react/lib/Tooltip';
@Component({
  selector: 'aks-periscope',
  templateUrl: './aks-periscope.component.html',
  styleUrls: ['./aks-periscope.component.scss']
})
export class AksPeriscopeComponent implements OnInit {

  managedClusterResourceName: string;
  status: toolStatus = toolStatus.Loading;
  collapsed: boolean = false;
  chosenStorageAccount: string = "";
  aksPeriscopeEnabled: boolean = true;


  constructor( 
    private globals: Globals, 
    private telemetryService: TelemetryService) {
    this.managedClusterResourceName = "Cluster-Name";
  }

  startPeriscope() {
    if (this.validateSettings()) {
      this.savePeriscopeSettings();
    }
  }

  toggleStorageAccountPanel() {
    this.globals.openCreateStorageAccountPanel = !this.globals.openCreateStorageAccountPanel;
    this.telemetryService.logEvent("OpenCreateStorageAccountPanel");
    this.telemetryService.logPageView("CreateStorageAccountPanelView");
  }

  savePeriscopeSettings() {
    //TODO save setting such as storage account and other stuff
  }

  validateSettings(): boolean {
    return true;
  }

  ngOnInit(){
    
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


export enum toolStatus {
  Loading,
  CheckingBlobSasUri,
  Loaded,
  SavingCrashMonitoringSettings,
  SettingsSaved,
  Error
}

