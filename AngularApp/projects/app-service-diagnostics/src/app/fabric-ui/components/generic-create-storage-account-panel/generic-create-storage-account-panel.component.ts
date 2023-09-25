import { Component, OnInit} from '@angular/core';
import { PanelType, IChoiceGroupOption, IDropdownOption } from 'office-ui-fabric-react';
import { StorageService } from '../../../shared/services/storage.service';
import { StorageAccountProperties } from '../../../shared-v2/services/shared-storage-account.service';
import { StorageAccount, StorageKeys } from '../../../shared/models/storage';
import { ArmService } from '../../../shared/services/arm.service';
import { interval,  Subscription } from 'rxjs';
import { DiagnosticManagedResourceService } from '../../../shared-v2/services/diagnostic-managed-resource.service';
import { StorageAccountGlobals } from '../../../storage-account-globals';
import { ArmResourceMetaInfo } from '../../../shared/models/armObj';

@Component({
  selector: 'generic-create-storage-account-panel',
  templateUrl: './generic-create-storage-account-panel.component.html',
  styleUrls: ['./generic-create-storage-account-panel.component.scss']
})
export class GenericCreateStorageAccountPanelComponent implements OnInit {

  type: PanelType = PanelType.custom;
  width: string = "850px";
  error: any;
  creatingStorageAccount: boolean = false;
  newStorageAccountName: string;
  createNewMode: boolean = true;

  errorMessage: string = "";
  loadingStroageAccounts: boolean = true;
  defaultSelectedKey: string = "";
  selectedStorageAccount: StorageAccount = null;
  generatingSasUri: boolean = false;

  subscriptionName: string = "";
  resourceToDiagnose: ArmResourceMetaInfo = null;


  subscriptionOperationStatus: Subscription;

     
  pollCount: number = 0;
  storageAccounts: IDropdownOption[] = [];
  choiceGroupOptions: IChoiceGroupOption[] = [
    { key: 'CreateNew', text: 'Create new', defaultChecked: true, onClick: () => { this.createNewMode = true } },
    { key: 'ChooseExisting', text: 'Choose existing', onClick: () => { this.createNewMode = false } }
  ];

  private apiVersion: string = "2019-06-01";
  
  constructor(public storageAccountGlobals: StorageAccountGlobals, 
    private _storageService: StorageService, 
    private _armService: ArmService, 
    private _diagResourceService: DiagnosticManagedResourceService) {
  }

  ngOnInit() {
    this._diagResourceService.getManagedResource().subscribe((resource: ArmResourceMetaInfo) => {
      this.resourceToDiagnose = resource;

      this.subscriptionName = resource.subscriptionId;
      
      this._armService.getArmResource<any>("subscriptions/" + this.resourceToDiagnose.subscriptionId, this.apiVersion).subscribe(
        (subscriptionResponse) => {
          if (subscriptionResponse != null) {
            this.subscriptionName = subscriptionResponse.displayName;
          }
        }
      );
      
      this._storageService.getStorageAccounts(this.resourceToDiagnose.subscriptionId).subscribe(
        (resp: StorageAccount[]) => {
          this.loadingStroageAccounts = false;
          let storageAccounts = resp;
          this.initStorageAccounts(storageAccounts, this.getResourceLocation());
        },
        error => {
          this.errorMessage = `Failed to retrieve storage accounts - ${error}`;
        });

      this.newStorageAccountName = this.resourceToDiagnose.name + "diagnostic-storage";
    });
  } 

  initStorageAccounts(storageAccounts: StorageAccount[], currentLocation: string) {
    this.storageAccounts = [];
    let accountsCurrentLocation = storageAccounts.filter(x => x.location === currentLocation);

    for (let index = 0; index < accountsCurrentLocation.length; index++) {
      let isSelected = false;
      const acc = accountsCurrentLocation[index];
      if (index === 0) {
        isSelected = true;
      }
      this.storageAccounts.push({
        key: acc.name,
        text: acc.name,
        ariaLabel: acc.name,
        data: acc,
        isSelected: isSelected
      });

      if (isSelected) {
        this.defaultSelectedKey = acc.name;
        this.selectedStorageAccount = acc;
      }
    }
  }

  getResourceLocation() {
    let location = this.resourceToDiagnose.location;
    location = location.replace(/\s/g, "").toLowerCase();
    return location;
  }

  dismissedHandler() {
    this.storageAccountGlobals.openCreateStorageAccountPanel = false;
  }

  updateStorageAccount(e: { event: Event, newValue?: string }) {
    this.newStorageAccountName = e.newValue.toString();
  }

  saveChanges() {
    this.error = '';
    this.errorMessage = '';

    if (this.createNewMode) {
      this.creatingStorageAccount = true;
      this._storageService.createStorageAccount(this.resourceToDiagnose.subscriptionId, this.resourceToDiagnose.resourceGroupName, this.newStorageAccountName, this.resourceToDiagnose.location).subscribe(
        (locationHeader: string) => {
          if (locationHeader != null) {
            this.subscriptionOperationStatus = interval(10000).subscribe(() => this.checkAccountStatus(locationHeader));
          } else {
            this.creatingStorageAccount = false;
          }
        },
        error => {
          this.creatingStorageAccount = false;
          this.error = error;
          this.errorMessage = "Failed to create a storage account";
      });
    } else {
      this.setBlobSasUri(this.selectedStorageAccount.id, this.selectedStorageAccount.name);
    }
  }

  checkAccountStatus(locationHeader: string) {
    this.pollCount++;
    if (this.pollCount > 20) {
      this.creatingStorageAccount = false;
      this.error = "The operation to create the storage account timed out. Please retry after some time or use an existing storage account";
      this.subscriptionOperationStatus.unsubscribe();
      return;
    }
    this._armService.getResourceFullUrl(locationHeader, true).subscribe(
      (storageAccount: StorageAccount) => {
        if (storageAccount != null) {
          this.subscriptionOperationStatus.unsubscribe();
          this.creatingStorageAccount = false;
          this.setBlobSasUri(storageAccount.id, storageAccount.name);
        }
    });
  }

  setBlobSasUri(storageAccountId: string, storageAccountName: string) {
    this.generatingSasUri = true;

    this._storageService.getStorageAccountKey(storageAccountId).subscribe(
      (resp: StorageKeys) => {
        if (resp.keys && resp.keys.length > 0) {
          if (resp.keys[0].value == null) {
            this.generatingSasUri = false;
            this.error = "Failed to retrieve keys for this storage account. Please choose a different storage account or create a new one";
            return;
          }
          let storageKey = resp.keys[0].value;
          this.generateStorageConnectionString(storageAccountName, storageKey);
        }
    });
  }

  generateStorageConnectionString(storageAccountName: string, storageKey: string) {

    let storageAccountProperties: StorageAccountProperties = new StorageAccountProperties();
    storageAccountProperties.name = storageAccountName;
    storageAccountProperties.connectionString = `DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageKey};EndpointSuffix=${this._armService.storageUrl}`;
    this._diagResourceService.setStorageConfiguration(this.resourceToDiagnose, storageAccountProperties).subscribe(
      resp => {
        this.generatingSasUri = false;
        this.storageAccountGlobals.emitChange(storageAccountProperties);
      }, error => {
        this.errorMessage = "Failed while updating Storage Connection string app setting";
        this.generatingSasUri = false;
        this.error = error;
      });
  }

  selectStorageAccount(event: any) {
    this.selectedStorageAccount = event.option.data;
  }

}
