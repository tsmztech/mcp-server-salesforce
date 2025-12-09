import jsforce from "jsforce";
type Connection = InstanceType<typeof jsforce.Connection>;
import * as xml2js from 'xml2js';

/**
 * Utility class for Salesforce Metadata API operations
 */
export class MetadataUtils {
  private conn: Connection;

  constructor(connection: Connection) {
    this.conn = connection;
  }

  /**
   * Deploy metadata to Salesforce
   * @param metadata - Metadata object to deploy
   * @param metadataType - Type of metadata (Report, Dashboard, etc.)
   * @param fullName - Full name of the metadata component
   * @returns Deployment result
   */
  async deployMetadata(
    metadata: any,
    metadataType: string,
    fullName: string
  ): Promise<any> {
    try {
      // Create metadata using JSforce
      const result = await this.conn.metadata.create(metadataType, {
        fullName: fullName,
        ...metadata
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to deploy ${metadataType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieve metadata from Salesforce
   * @param metadataType - Type of metadata to retrieve
   * @param fullName - Full name of the metadata component
   * @returns Retrieved metadata
   */
  async retrieveMetadata(
    metadataType: string,
    fullName: string
  ): Promise<any> {
    try {
      const result = await this.conn.metadata.read(metadataType, fullName);
      return result;
    } catch (error) {
      throw new Error(`Failed to retrieve ${metadataType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update existing metadata
   * @param metadata - Updated metadata object
   * @param metadataType - Type of metadata
   * @param fullName - Full name of the metadata component
   * @returns Update result
   */
  async updateMetadata(
    metadata: any,
    metadataType: string,
    fullName: string
  ): Promise<any> {
    try {
      const result = await this.conn.metadata.update(metadataType, {
        fullName: fullName,
        ...metadata
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to update ${metadataType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete metadata
   * @param metadataType - Type of metadata to delete
   * @param fullName - Full name of the metadata component
   * @returns Deletion result
   */
  async deleteMetadata(
    metadataType: string,
    fullName: string
  ): Promise<any> {
    try {
      const result = await this.conn.metadata.delete(metadataType, fullName);
      return result;
    } catch (error) {
      throw new Error(`Failed to delete ${metadataType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List metadata of a specific type
   * @param metadataType - Type of metadata to list
   * @returns List of metadata
   */
  async listMetadata(metadataType: string): Promise<any[]> {
    try {
      const result = await this.conn.metadata.list([
        { type: metadataType, folder: null }
      ]);

      return Array.isArray(result) ? result : [result];
    } catch (error) {
      throw new Error(`Failed to list ${metadataType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Sanitize name for Salesforce API names
 * @param name - Name to sanitize
 * @returns Sanitized name
 */
export function sanitizeApiName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')  // Can't start with number
    .substring(0, 80);  // Max 80 characters
}

/**
 * Build report folder path
 * @param folderName - Folder name
 * @returns Folder path
 */
export function buildReportFolderPath(folderName: string): string {
  // Handle "Private Reports" specially
  if (folderName === 'Private Reports' || folderName === 'private') {
    return 'Private Reports';
  }
  
  // Public folder
  if (folderName === 'Public Reports' || folderName === 'public') {
    return 'Public Reports';
  }

  return folderName;
}
