import { Request, Response } from 'express';
import OptionSettings from '../models/OptionSettings';
import logger from '../utils/logger';
import { emitOptionsUpdate } from '../services/socketService';

const ensureSettings = async () => {
  let doc = await OptionSettings.findOne({ key: 'global' });
  if (!doc) {
    doc = new OptionSettings({ key: 'global' });
    await doc.save();
  }
  return doc;
};

// Helper function to get lead stages (used by validation)
export const getLeadStages = async (): Promise<Array<{ label: string; subStages: string[]; color: string }>> => {
  try {
    const doc = await ensureSettings();
    const leadStages = (doc.leadStages || []).map((stage: any) => {
      const label = stage.label || stage.value || '';
      return { 
        label, 
        subStages: stage.subStages || [],
        color: stage.color || 'gray'
      };
    });
    return leadStages;
  } catch (error) {
    logger.error('Error fetching lead stages:', error);
    // Return default stages as fallback
    return [
      { label: 'Cold', subStages: [], color: 'blue' },
      { label: 'Warm', subStages: [], color: 'yellow' },
      { label: 'Hot', subStages: [], color: 'red' },
      { label: 'Not Interested', subStages: [], color: 'gray' },
      { label: 'Walkin', subStages: [], color: 'purple' },
      { label: 'Online-Conversion', subStages: [], color: 'green' }
    ];
  }
};

export const getOptions = async (req: Request, res: Response) => {
  try {
    const doc = await ensureSettings();
    // Migrate old format and ensure all fields are present
    const leadStages = (doc.leadStages || []).map((stage: any) => {
      const label = stage.label || stage.value || '';
      return { 
        label, 
        subStages: stage.subStages || [],
        color: stage.color || 'gray'
      };
    });
    
    const response = { 
      success: true, 
      message: 'Options loaded', 
      data: { 
        courses: doc.courses, 
        locations: doc.locations, 
        statuses: doc.statuses,
        leadStages: leadStages
      } 
    };

    res.json(response);
  } catch (e) {
    logger.error('Get options error:', e);
    res.status(500).json({ success: false, message: 'Server error while fetching options' });
  }
};

export const updateOptions = async (req: Request, res: Response) => {
  try {
    const { courses, locations, statuses, leadStages } = req.body as { 
      courses?: string[]; 
      locations?: string[]; 
      statuses?: string[]; 
      leadStages?: Array<{ label: string; subStages: string[]; color?: string }> 
    };
    const doc = await ensureSettings();
    
    // Build update object
    const updateData: any = {};
    
    if (courses !== undefined) {
      updateData.courses = courses.filter(Boolean).map(s => s.trim());
    }
    if (locations !== undefined) {
      updateData.locations = locations.filter(Boolean).map(s => s.trim());
    }
    if (statuses !== undefined) {
      updateData.statuses = statuses.filter(Boolean).map(s => s.trim());
    }
    if (leadStages !== undefined) {
      // Validate that at least one lead stage exists
      const validStages = leadStages.filter(stage => stage && (stage.label || (stage as any).value));
      if (validStages.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one lead stage is required'
        });
      }
      
      // Process leadStages - Handle all fields including color
      updateData.leadStages = validStages.map(stage => {
        const label = stage.label || (stage as any).value || '';
        if (!label.trim()) {
          throw new Error('Lead stage label cannot be empty');
        }
        
        return {
          label: label.trim(),
          subStages: (stage.subStages || []).filter(Boolean).map(s => s.trim()),
          color: stage.color || 'gray'
        };
      });
      logger.info(`Updating leadStages: ${JSON.stringify(updateData.leadStages)}`);
    }
    
    // Update the document using updateOne with upsert to ensure the update is applied
    const updateResult = await OptionSettings.updateOne(
      { key: 'global' },
      { $set: updateData },
      { upsert: true }
    );
    logger.info(`Update result: ${JSON.stringify(updateResult)}`);
    
    // Fetch the updated document to ensure we return the latest data
    const updatedDoc = await OptionSettings.findOne({ key: 'global' });
    logger.info(`Updated doc leadStages: ${JSON.stringify(updatedDoc?.leadStages)}`);
    
    const responseData = { 
      courses: updatedDoc?.courses || [], 
      locations: updatedDoc?.locations || [], 
      statuses: updatedDoc?.statuses || [],
      leadStages: updatedDoc?.leadStages || []
    };
    
    // Emit real-time update to all connected users
    try {
      emitOptionsUpdate('all', responseData);
      logger.info('✅ Real-time options update sent to all users');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (options update):', socketError.message);
    }
    
    res.json({ 
      success: true, 
      message: 'Options updated', 
      data: responseData
    });
  } catch (e) {
    logger.error('Update options error:', e);
    res.status(500).json({ success: false, message: 'Server error while updating options' });
  }
};

