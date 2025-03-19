import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import axios from 'axios';

export default function MedicationOCRScreen({ route }) {
  const { imageUri } = route.params;
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [medicationInfo, setMedicationInfo] = useState({
    name: '',
    dosage: '',
    instructions: '',
    warnings: '',
    expirationDate: '',
    rxNumber: '',
    doctor: '',
    pharmacy: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const extractText = async () => {
      setLoading(true);
      try {
        // Convert the image to base64
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const base64data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            resolve(reader.result.split(',')[1]); // Remove the data URL prefix
          };
        });

        // Call Google Cloud Vision API
        const apiKey = 'AIzaSyCtf2UA4ly08Jpz4ZexKFY2Ts3lY2XFHyE'; // Replace with your API key
        const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const requestData = {
          requests: [
            {
              image: {
                content: base64data,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                },
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                }
              ],
            },
          ],
        };

        const result = await axios.post(apiUrl, requestData);
        const extractedText = result.data.responses[0].fullTextAnnotation?.text || 'No text found.';
        setRawText(extractedText);

        // Process the extracted text to identify medication information
        parseMedicationLabel(extractedText);
      } catch (error) {
        console.error('OCR Error:', error);
        setError('Failed to extract text from medication label.');
      } finally {
        setLoading(false);
      }
    };

    extractText();
  }, [imageUri]);

  const parseMedicationLabel = (text) => {
    // Basic parsing logic for medication labels
    // Note: This is a simplified version and may need refinement for specific label formats
    
    const lines = text.split('\n');
    const info = {
      name: '',
      dosage: '',
      instructions: '',
      warnings: '',
      expirationDate: '',
      rxNumber: '',
      doctor: '',
      pharmacy: ''
    };

    // Look for medication name (usually in larger text at the top)
    if (lines.length > 0) {
      info.name = lines[0].trim();
    }

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Look for dosage information
      if (lowerLine.includes('mg') || lowerLine.includes('mcg') || lowerLine.includes('ml')) {
        info.dosage = line.trim();
      }
      
      // Look for instructions
      if (lowerLine.includes('take') || lowerLine.includes('use') || lowerLine.match(/\d+\s*(tablet|capsule|pill)/)) {
        info.instructions = info.instructions ? `${info.instructions}\n${line.trim()}` : line.trim();
      }
      
      // Look for warnings
      if (lowerLine.includes('warning') || lowerLine.includes('caution') || lowerLine.includes('do not')) {
        info.warnings = info.warnings ? `${info.warnings}\n${line.trim()}` : line.trim();
      }
      
      // Look for expiration date
      if (lowerLine.includes('exp') || lowerLine.includes('expiration') || lowerLine.match(/exp\.\s*\d+\/\d+\/\d+/)) {
        info.expirationDate = line.trim();
      }
      
      // Look for Rx number
      if (lowerLine.includes('rx') || lowerLine.includes('prescription') || lowerLine.match(/rx\s*#\s*\d+/i)) {
        info.rxNumber = line.trim();
      }
      
      // Look for doctor information
      if (lowerLine.includes('dr.') || lowerLine.includes('doctor') || lowerLine.includes('prescribed by')) {
        info.doctor = line.trim();
      }
      
      // Look for pharmacy information
      if (lowerLine.includes('pharmacy') || lowerLine.includes('dispensed by') || lowerLine.includes('store')) {
        info.pharmacy = line.trim();
      }
    }

    setMedicationInfo(info);
  };

  return (
    <ScrollView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Analyzing medication label...</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <View style={styles.resultContainer}>
          <Text style={styles.sectionTitle}>Medication Information</Text>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{medicationInfo.name || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Dosage:</Text>
            <Text style={styles.value}>{medicationInfo.dosage || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Instructions:</Text>
            <Text style={styles.value}>{medicationInfo.instructions || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Warnings:</Text>
            <Text style={styles.value}>{medicationInfo.warnings || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Expiration:</Text>
            <Text style={styles.value}>{medicationInfo.expirationDate || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Rx Number:</Text>
            <Text style={styles.value}>{medicationInfo.rxNumber || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Doctor:</Text>
            <Text style={styles.value}>{medicationInfo.doctor || 'Not detected'}</Text>
          </View>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Pharmacy:</Text>
            <Text style={styles.value}>{medicationInfo.pharmacy || 'Not detected'}</Text>
          </View>
          
          <Text style={styles.sectionTitle}>Raw Extracted Text</Text>
          <View style={styles.rawTextContainer}>
            <Text style={styles.rawText}>{rawText}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F5F7FA',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    minHeight: 300,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#0066CC',
  },
  resultContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 16,
    color: '#333',
  },
  infoSection: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#333',
  },
  rawTextContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  rawText: {
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  }
});