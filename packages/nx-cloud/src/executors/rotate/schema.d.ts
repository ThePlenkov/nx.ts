export interface NxCloudRotateOptions {
  /** Name sent to create-org-and-workspace. Default: root package.json `name`. */
  workspaceName?: string
  /** Nx Cloud instance URL. Default: NX_CLOUD_API/NRWL_API env or https://cloud.nx.app. */
  cloudUrl?: string
  /** InstallationSource tag sent with the request. Default: "nx-devkit-nx-cloud". */
  installationSource?: string
  /** Call the API but do not rewrite nx.json. Default: false. */
  dryRun?: boolean
}

export interface RotateResult {
  success: boolean
  nxCloudId?: string
  token?: string
  url?: string
  previousBinding?: string
}
