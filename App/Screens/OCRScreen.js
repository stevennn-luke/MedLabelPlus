import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Image } from 'react-native';
import axios from 'axios';

export default function MedicationOCRScreen({ route }) {
  const { imageUri } = route.params;
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [medicationInfo, setMedicationInfo] = useState({
    name: '',
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

        // Extract potential medication names
        const potentialMedNames = extractPotentialMedicationNames(extractedText);
        
        // Validate and fetch real medication information from the API
        if (potentialMedNames.length > 0) {
          await validateAndFetchMedicationInfo(potentialMedNames);
        } else {
          setError('Could not identify any medication names from the label.');
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

  const extractPotentialMedicationNames = (text) => {
    // Preprocessing text
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const potentialNames = [];
    
    // Common medication name patterns
    const commonMedPatterns = [
      /\b(tablet|capsule|solution|suspension|injection)\b/i,
      /\b\d+\s*(mg|mcg|ml|g)\b/i,
      /\b(extended|controlled|delayed)\s*release\b/i
    ];

    // Dictionary of common medication endings
    const medSuffixes = ['in', 'ol', 'ide', 'ine', 'one', 'ate', 'ium', 'erol', 'arin', 'azole', 'mycin', 'cillin'];

    // Check each line for possible medication name
    for (let i = 0; i < Math.min(lines.length, 15); i++) { // Focus on first 15 lines for better coverage
      const line = lines[i].trim();
      if (!line || line.length < 3) continue; // Skip very short lines
      
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
      
      // Only consider lines with decent score
      if (score >= 2) {
        // Extract just the potential medication name without dosage
        const possibleName = line.split(/\d+\s*(mg|mcg|ml|g)/i)[0].trim();
        // Clean up the name further by removing common prefixes and extra text
        const cleanedName = possibleName
          .replace(/^(rx|prescription:?|medication:?|drug:?)\s*/i, '')
          .trim();
        
        if (cleanedName && cleanedName.length >= 3) {
          // Extract the first 1-3 words which are most likely to be the med name
          const wordLimit = 3;
          const words = cleanedName.split(/\s+/);
          const nameCandidate = words.slice(0, Math.min(words.length, wordLimit)).join(' ');
          
          // Add to potential names with score for sorting
          potentialNames.push({
            name: nameCandidate,
            score: score
          });
        }
      }
    }
    
    // Sort by score (highest first) and return just the names
    return potentialNames
      .sort((a, b) => b.score - a.score)
      .map(item => item.name);
  };

  const validateAndFetchMedicationInfo = async (potentialNames) => {
    setFetchingDetails(true);
    
    // Try each potential name until we find a match
    for (const medName of potentialNames) {
      try {
        // Try OpenFDA API first
        const encodedName = encodeURIComponent(medName);
        const apiUrl = `https://api.fda.gov/drug/label.json?search=(openfda.brand_name:${encodedName}+OR+openfda.generic_name:${encodedName})&limit=1`;
        
        const response = await axios.get(apiUrl);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
          const result = response.data.results[0];
          const openfda = result.openfda || {};
          
          // We found a valid medication! Set the name and details
          const confirmedName = openfda.brand_name ? 
            openfda.brand_name[0] : 
            (openfda.generic_name ? openfda.generic_name[0] : medName);
          
          setMedicationInfo({ name: confirmedName });
          
          // Get drug details from OpenFDA response
          setMedicationDetails({
            brandName: openfda.brand_name ? openfda.brand_name[0] : confirmedName,
            genericName: openfda.generic_name ? openfda.generic_name[0] : 'Unknown',
            activeIngredient: result.active_ingredient ? result.active_ingredient[0] : 'Unknown',
            indications: result.indications_and_usage ? result.indications_and_usage[0] : 'Unknown',
            warnings: result.warnings ? result.warnings[0] : 'Unknown',
            dosage: result.dosage_and_administration ? result.dosage_and_administration[0] : 'Unknown',
            interactions: result.drug_interactions ? result.drug_interactions[0] : 'Unknown',
            manufacturer: openfda.manufacturer_name ? openfda.manufacturer_name[0] : 'Unknown',
          });
          
          // We found a match, so we can stop checking other potential names
          setFetchingDetails(false);
          return;
        }
        
        // If OpenFDA fails, try RxNav
        const rxNavUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodedName}`;
        const rxResponse = await axios.get(rxNavUrl);
        
        if (rxResponse.data && rxResponse.data.drugGroup && 
            rxResponse.data.drugGroup.conceptGroup) {
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
            // We found a valid medication in RxNav!
            const confirmedName = drugInfo.name;
            setMedicationInfo({ name: confirmedName });
            
            // Get more details using RxClass API
            const rxClassUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json?drugName=${encodeURIComponent(confirmedName)}&relaSource=MEDRT`;
            const classResponse = await axios.get(rxClassUrl);
            
            let className = 'Unknown';
            if (classResponse.data && classResponse.data.rxclassDrugInfoList && 
                classResponse.data.rxclassDrugInfoList.rxclassDrugInfo) {
              const drugClasses = classResponse.data.rxclassDrugInfoList.rxclassDrugInfo;
              if (drugClasses.length > 0) {
                className = drugClasses[0].rxclassMinConceptItem.className;
              }
            }
            
            setMedicationDetails({
              brandName: confirmedName,
              genericName: drugInfo.synonym || confirmedName,
              activeIngredient: drugInfo.tty || 'Unknown',
              indications: className || 'Unknown',
              warnings: 'See package insert for details',
              dosage: 'See package insert for details',
              interactions: 'See package insert for details',
              manufacturer: 'Unknown',
            });
            
            // We found a match, so we can stop checking other potential names
            setFetchingDetails(false);
            return;
          }
        }
      } catch (error) {
        console.error(`Error validating medication name "${medName}":`, error);
        // Continue to the next potential name
      }
    }
    
    // If we get here, none of the potential names matched a known medication
    setMedicationInfo({ name: potentialNames[0] });
    setMedicationDetails({
      brandName: potentialNames[0],
      genericName: 'Unknown - medication not found in database',
      activeIngredient: 'Unknown',
      indications: 'Unknown',
      warnings: 'Unknown',
      dosage: 'Unknown',
      interactions: 'Unknown',
      manufacturer: 'Unknown',
    });
    
    setFetchingDetails(false);
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
          {/* Original Image & Extracted Text section */}
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
          
          {/* Medication Information section */}
          <Text style={styles.sectionTitle}>Medication Information</Text>
          
          {fetchingDetails ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0066CC" />
              <Text style={styles.loadingText}>Validating medication and loading details...</Text>
            </View>
          ) : (
            <>
              <View style={styles.infoSection}>
                <Text style={styles.label}>Medication Name:</Text>
                <Text style={styles.value}>{medicationInfo.name || 'Not detected'}</Text>
              </View>
              
              {medicationDetails && (
                <>
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
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Manufacturer:</Text>
                    <Text style={styles.value}>{medicationDetails.manufacturer}</Text>
                  </View>
                </>
              )}
            </>
          )}
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