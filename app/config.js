// Configuration for industry-specific fields
const industryFields = {
  'Tensile': {
    productFields: [
      "Product_Name",
      "Project_Details",
      "Fabric_Category",
      "RM_Type",
      "Qty_Required_Nos",
      "RM",
      "UOM11",
      "Nos_Per_Set",
      "Total_No_of_Sets",
      "Fabric_Color",
      "Color_Code",
      "GSM",
      "W_m",
      "L_m",
      "Remarks2",
      "Preferred_Variant",
      "Variant_Description",
      "Added_User",
      "Added_Time"
    ],
    fieldLabels: {
      "RM_Type": "Fabric Type",
      "RM": "Fabric Code",
      "W_m": "Width (m)",
      "L_m": "Length (m)",
      "UOM11": "UOM",
      "Nos_Per_Set": "Nos Per Set",
      "Remarks2": "Remarks"
    }
  },
  'Roll Door': {
    productFields: [
      "Product_Name",
      "Project_Details",
      "Fabric_Category",
      "RM_Type",
      "Qty_Required_Nos",
      "RM",
      "UOM11",
      "Nos_Per_Set",
      "Total_No_of_Sets",
      "Fabric_Color",
      "Color_Code",
      "GSM",
      "W_m",
      "L_m",
      "Remarks2",
      "Preferred_Variant",
      "Variant_Description",
      "Roll_Door_Type",
      "Structure",
      "Transparent_fabric1",
      "Printing",
      "Added_User",
      "Added_Time"
    ],
    fieldLabels: {
      "RM_Type": "Fabric Type",
      "RM": "Fabric Code",
      "W_m": "Width (m)",
      "L_m": "Length (m)",
      "Transparent_fabric1": "Transparent Fabric",
      "UOM11": "UOM",
      "Nos_Per_Set": "Nos Per Set",
      "Remarks2": "Remarks",
      "Printing": "Printing"
    }
  }
};