import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Image } from 'react-native';
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
  const [medicationDetails, setMedicationDetails] = useState(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);

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
                  maxResults: 1,
                },
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1,
                }
              ],
            },
          ],
        };

        const result = await axios.post(apiUrl, requestData);
        const extractedText = result.data.responses[0].fullTextAnnotation?.text || 'No text found.';
        setRawText(extractedText);

        // Process the extracted text to identify medication information
        const medicationInfo = parseMedicationLabel(extractedText);
        
        // If we have a medication name, fetch additional information
        if (medicationInfo.name) {
          fetchMedicationDetails(medicationInfo.name);
        }
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
    // Preprocessing text
    const preprocessedText = text
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .replace(/[^\w\s.,-]/g, '') // Remove special characters but keep periods, commas, and hyphens
      .trim();
    
    const lines = preprocessedText.split('\n');
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

    // Common medication name patterns
    const commonMedPatterns = [
      /\b(tablet|capsule|solution|suspension|injection)\b/i,
      /\b\d+\s*(mg|mcg|ml|g)\b/i,
      /\b(extended|controlled|delayed)\s*release\b/i
    ];

    // Dictionary of common medication endings
    const medSuffixes = ['in', 'ol', 'ide', 'ine', 'one', 'ate', 'ium', 'erol', 'arin', 'azole', 'mycin', 'cillin'];

    // Improved medication name detection with scoring
    let bestNameCandidate = '';
    let highestScore = 0;

    // Check each line for possible medication name
    for (let i = 0; i < Math.min(lines.length, 10); i++) { // Focus on first 10 lines
      const line = lines[i].trim();
      if (!line) continue;
      
      let score = 0;
      
      // Prioritize lines near the top
      score += Math.max(0, 10 - i);
      
      // Check for common medication name patterns
      for (const pattern of commonMedPatterns) {
        if (pattern.test(line)) {
          score += 5;
        }
      }
      
      // Check for common medication name suffixes
      for (const suffix of medSuffixes) {
        if (line.toLowerCase().includes(suffix)) {
          score += 3;
        }
      }
      
      // Bonus for capitalized words that might be brand names
      if (/^[A-Z][a-z]/.test(line)) {
        score += 2;
      }
      
      // If this line has the highest score so far, update our best candidate
      if (score > highestScore) {
        // Extract just the medication name without dosage if possible
        const possibleName = line.split(/\d+\s*(mg|mcg|ml|g)/i)[0].trim();
        bestNameCandidate = possibleName || line;
        highestScore = score;
      }
    }
    
    // If we found a good candidate, use it
    if (bestNameCandidate) {
      info.name = bestNameCandidate;
    } else if (lines.length > 0) {
      // Fallback to first line if no good candidate found
      info.name = lines[0].trim();
    }

    // Process the rest of the information...
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
    return info;
  };

  const fetchMedicationDetails = async (medicationName) => {
    setFetchingDetails(true);
    try {
      // Using OpenFDA API to fetch medication details
      // This API provides comprehensive information about drugs
      const medName = encodeURIComponent(medicationName.split(' ')[0]); // Take first word as most likely to be correct
      const apiUrl = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:${medName}+openfda.generic_name:${medName}&limit=1`;
      
      const response = await axios.get(apiUrl);
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        const openfda = result.openfda || {};
        
        // Get drug details from OpenFDA response
        setMedicationDetails({
          brandName: openfda.brand_name ? openfda.brand_name[0] : medicationName,
          genericName: openfda.generic_name ? openfda.generic_name[0] : 'Unknown',
          activeIngredient: result.active_ingredient ? result.active_ingredient[0] : 'Unknown',
          indications: result.indications_and_usage ? result.indications_and_usage[0] : 'Unknown',
          warnings: result.warnings ? result.warnings[0] : 'Unknown',
          dosage: result.dosage_and_administration ? result.dosage_and_administration[0] : 'Unknown',
          interactions: result.drug_interactions ? result.drug_interactions[0] : 'Unknown',
          manufacturer: openfda.manufacturer_name ? openfda.manufacturer_name[0] : 'Unknown',
        });
      } else {
        // Fallback to RxNav API if OpenFDA doesn't return results
        const rxNavUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${medName}`;
        const rxResponse = await axios.get(rxNavUrl);
        
        if (rxResponse.data && rxResponse.data.drugGroup && rxResponse.data.drugGroup.conceptGroup) {
          const concepts = rxResponse.data.drugGroup.conceptGroup;
          let drugInfo = null;
          
          // Find the first group with drugs
          for (const group of concepts) {
            if (group.conceptProperties && group.conceptProperties.length > 0) {
              drugInfo = group.conceptProperties[0];
              break;
            }
          }
          
          if (drugInfo) {
            // Get more details using RxClass API
            const rxClassUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json?drugName=${encodeURIComponent(drugInfo.name)}&relaSource=MEDRT`;
            const classResponse = await axios.get(rxClassUrl);
            
            let className = 'Unknown';
            if (classResponse.data && classResponse.data.rxclassDrugInfoList && classResponse.data.rxclassDrugInfoList.rxclassDrugInfo) {
              const drugClasses = classResponse.data.rxclassDrugInfoList.rxclassDrugInfo;
              if (drugClasses.length > 0) {
                className = drugClasses[0].rxclassMinConceptItem.className;
              }
            }
            
            setMedicationDetails({
              brandName: medicationName,
              genericName: drugInfo.name || 'Unknown',
              activeIngredient: drugInfo.synonym || 'Unknown',
              indications: className || 'Unknown',
              warnings: 'Information not available',
              dosage: 'Information not available',
              interactions: 'Information not available',
              manufacturer: 'Information not available',
            });
          } else {
            throw new Error('No drug information found');
          }
        } else {
          throw new Error('No drug information found');
        }
      }
    } catch (error) {
      console.error('Error fetching medication details:', error);
      // Set basic information if API call fails
      setMedicationDetails({
        brandName: medicationName,
        genericName: 'Unknown',
        activeIngredient: 'Unknown',
        indications: 'Unknown',
        warnings: 'Unknown',
        dosage: 'Unknown',
        interactions: 'Unknown',
        manufacturer: 'Unknown',
      });
    } finally {
      setFetchingDetails(false);
    }
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
          {/* Original Image & Extracted Text section now first */}
          <Text style={styles.sectionTitle}>Original Image & Extracted Text</Text>
          <View style={styles.imageTextContainer}>
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: imageUri }} 
                style={styles.medicationImage} 
                resizeMode="contain"
              />
            </View>
            
            <View style={styles.rawTextContainerSide}>
              <Text style={styles.rawText}>{rawText}</Text>
            </View>
          </View>
          
          {/* Medication Information section moved below */}
          <Text style={styles.sectionTitle}>Medication Information</Text>
          
          <View style={styles.infoSection}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{medicationInfo.name || 'Not detected'}</Text>
          </View>
          
          {fetchingDetails ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0066CC" />
              <Text style={styles.loadingText}>Loading medication details...</Text>
            </View>
          ) : medicationDetails ? (
            <View>
              <View style={styles.infoSection}>
                <Text style={styles.label}>Generic Name:</Text>
                <Text style={styles.value}>{medicationDetails.genericName}</Text>
              </View>
              
              <View style={styles.infoSection}>
                <Text style={styles.label}>Active Ingredient:</Text>
                <Text style={styles.value}>{medicationDetails.activeIngredient}</Text>
              </View>
              
              <View style={styles.infoSection}>
                <Text style={styles.label}>Used For:</Text>
                <Text style={styles.value}>{medicationDetails.indications}</Text>
              </View>
            </View>
          ) : null}
          
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    minHeight: 100,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
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
  imageTextContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  imageContainer: {
    flex: 1,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  medicationImage: {
    width: '100%',
    height: 200,
    borderRadius: 6,
  },
  rawTextContainerSide: {
    flex: 1,
    padding: 16,
    maxHeight: 200,
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
  },
});