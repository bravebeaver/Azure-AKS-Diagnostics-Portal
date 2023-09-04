import {
  CommsService, DiagnosticDataModule, DiagnosticService, DiagnosticSiteService,
  PUBLIC_DEV_CONFIGURATION, PUBLIC_PROD_CONFIGURATION, SolutionService, SettingsService,
  BackendCtrlQueryService, GenieGlobals, PortalActionGenericService,
  KustoTelemetryService, AppInsightsTelemetryService, UnhandledExceptionHandlerService,
  GenericFeatureService, OptInsightsGenericService
} from 'diagnostic-data';
import { SiteService } from 'projects/app-service-diagnostics/src/app/shared/services/site.service';
import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { environment } from '../environments/environment';
import { AppComponent } from './app.component';
import {
  ResourceRedirectComponent
} from './shared/components/resource-redirect/resource-redirect.component';
import { TestInputComponent } from './shared/components/test-input/test-input.component';
import { GenericApiService } from './shared/services/generic-api.service';
import { GenericCommsService } from './shared/services/generic-comms.service';
import { GenericSolutionService } from './shared/services/generic-solution.service';
import { LocalBackendService } from './shared/services/local-backend.service';
import { PortalKustoTelemetryService } from './shared/services/portal-kusto-telemetry.service';
import { PortalAppInsightsTelemetryService } from './shared/services/portal-appinsights-telemetry.service';
import { SharedModule } from './shared/shared.module';
import { ContentService } from './shared-v2/services/content.service';
import { CategoryChatStateService } from './shared-v2/services/category-chat-state.service';
import { StartupModule } from './startup/startup.module';
import { CustomMaterialModule } from './material-module';
import { PortalSettingsService } from './shared/services/settings.service';
import { AppInsightsService } from './shared/services/appinsights/appinsights.service';
import { AppInsightsQueryService } from './../../../diagnostic-data/src/lib/services/appinsights.service';
import { HighchartsChartModule } from 'highcharts-angular';
import { AngularReactBrowserModule } from '@angular-react/core';
import { Globals } from './globals';
import { CategoryService } from './shared-v2/services/category.service';
import { FeatureService } from './shared-v2/services/feature.service';
import { LoggingV2Service } from './shared-v2/services/logging-v2.service';
import { SupportTopicService } from './shared-v2/services/support-topic.service';
import { ResourceResolver } from './home/resolvers/resource.resolver';
import { ResourcesModule } from './resources/resources.module';
import { WebSitesModule } from './resources/web-sites/web-sites.module';
import { ManagedClustersDiagnosticsModule } from  './resources/container-service/managed-cluster-diagnostics.module';
import { BackendCtrlService } from './shared/services/backend-ctrl.service';
import { PortalActionService} from './shared/services/portal-action.service';
import { FabricModule } from './fabric-ui/fabric.module';
import { QuickLinkService } from './shared-v2/services/quick-link.service';
import { RiskAlertService } from './shared-v2/services/risk-alert.service';
import { ThemeService } from './theme/theme.service';
import { GenericThemeService } from 'diagnostic-data';
import { ClientScriptService } from './shared-v2/services/client-script.service';
import { OpenAIArmService } from 'diagnostic-data';
import { OptInsightsService } from './shared/services/optinsights/optinsights.service';

@NgModule({
  imports: [
    AngularReactBrowserModule,
    HttpClientModule,
    ResourcesModule,
    WebSitesModule,
    ManagedClustersDiagnosticsModule,
    SharedModule.forRoot(),
    StartupModule.forRoot(),
    DiagnosticDataModule.forRoot(environment.production ? PUBLIC_PROD_CONFIGURATION : PUBLIC_DEV_CONFIGURATION),
    BrowserAnimationsModule,
    RouterModule.forRoot([
    {
        path: 'test',
        component: TestInputComponent,
    },
    {
        path: 'resourceRedirect',
        component: ResourceRedirectComponent,
    },
    {
        path: 'resource',
        loadChildren: () => import('./resources/resources.module').then(m => m.ResourcesModule),
    }
], { relativeLinkResolution: 'legacy' }),
    CustomMaterialModule,
    HighchartsChartModule,
    FabricModule
  ],
  declarations: [
    AppComponent,
  ],
  providers: [
    { provide: KustoTelemetryService, useExisting: PortalKustoTelemetryService },
    { provide: AppInsightsTelemetryService, useExisting: PortalAppInsightsTelemetryService },
    {
      provide: DiagnosticService,
      useFactory: (_localBackendService: LocalBackendService, _genericApiService: GenericApiService) => environment.useApplensBackend ? _localBackendService : _genericApiService,
      deps: [LocalBackendService, GenericApiService]
    },
    { provide: CommsService, useExisting: GenericCommsService },
    { provide: AppInsightsQueryService, useExisting: AppInsightsService },
    { provide: DiagnosticSiteService, useExisting: SiteService },
    {
      provide: ErrorHandler,
      useClass: UnhandledExceptionHandlerService
    },
    { provide: SolutionService, useExisting: GenericSolutionService },
    { provide: SettingsService, useExisting: PortalSettingsService },
    { provide: GenieGlobals, useExisting: Globals },
    CategoryChatStateService,
    ContentService,
    OpenAIArmService,
    ClientScriptService,
    CategoryService,
    { provide: GenericFeatureService, useExisting: FeatureService },
    LoggingV2Service,
    SupportTopicService,
    ResourceResolver,
    { provide: BackendCtrlQueryService, useExisting: BackendCtrlService },
    { provide: PortalActionGenericService, useExisting: PortalActionService},
    QuickLinkService,
    RiskAlertService,
    ThemeService,
    { provide: GenericThemeService, useExisting: ThemeService },
    { provide: OptInsightsGenericService, useExisting: OptInsightsService }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
