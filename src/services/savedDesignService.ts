import { SavedDesign } from '../types';

export const savedDesignService = {
  createOrUpdateDesign(
    designData: Omit<SavedDesign, 'id' | 'lastPrintedAt' | 'printCount'>,
    existingDesigns: SavedDesign[]
  ): { nextDesigns: SavedDesign[], updatedDesign: SavedDesign } {
    const existing = existingDesigns.find(d => 
      (d.imageUrl && designData.imageUrl && d.imageUrl === designData.imageUrl) ||
      (d.productName === designData.productName && d.customerName === designData.customerName)
    );

    if (existing) {
      const updatedDesign = { ...existing, printCount: (existing.printCount || 1) + 1, lastPrintedAt: new Date().toISOString() };
      const nextDesigns = existingDesigns.map(d => d.id === existing.id ? updatedDesign : d);
      return { nextDesigns, updatedDesign };
    }

    const uniqueId = 'des-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const newDesign: SavedDesign = {
      ...designData,
      id: uniqueId,
      lastPrintedAt: new Date().toISOString(),
      printCount: 1
    };
    
    return {
      nextDesigns: [newDesign, ...existingDesigns],
      updatedDesign: newDesign
    };
  }
};
